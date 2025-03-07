from picamera2 import Picamera2, Preview
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
from flask import Flask, Response, jsonify, render_template
from datetime import datetime
import cv2
import io
import logging
import threading
import time
import sys
import os
import requests
import numpy as np

app = Flask(__name__)
picam2 = None

# Configuration presets
CONFIGS = {
    'full_res': {'size': (4608, 2592), 'fps': 15},
    '1080p': {'size': (1920, 1080), 'fps': 50},
    '720p': {'size': (1280, 720), 'fps': 100},
    '480p': {'size': (854, 480), 'fps': 120}
}

# Motion detection parameters
MOTION_THRESHOLD = 1000      # Amount of pixel change to trigger motion
RECORDING_EXTENSION = 5      # Seconds to extend recording when motion is detected
MAX_RECORDING_DURATION = 60  # Maximum recording duration in seconds

# Global variables
current_config = '1080p'
stream_active = False
frame_buffer = None
buffer_lock = threading.Lock()
stream_id = 0

# Motion detection variables
motion_state = {
    'detected': False,
    'recording': False,
    'last_motion_time': 0,
    'recording_start_time': 0,
    'scheduled_stop_time': 0,
    'output_file': None,
    'encoder': None
}

# API endpoint
API_ENDPOINT = "http://192.168.1.130/api/video/upload"

def initialize_camera():
    global picam2
    try:
        picam2 = Picamera2()
        return True
    except Exception as e:
        print(f"Failed to initialize camera: {str(e)}")
        return False

def configure_camera(config_name):
    global current_config, stream_id, stream_active

    if picam2 is None:
        if not initialize_camera():
            return False

    config = CONFIGS[config_name]

    try:
        # Stop current stream
        if stream_active:
            stop_stream()

        # Configure camera
        camera_config = picam2.create_video_configuration(
            main={"size": config['size']},
            controls={"FrameRate": config['fps']}
        )
        picam2.configure(camera_config)
        current_config = config_name

        # Increment stream ID to force client reconnection
        stream_id += 1

        # Start new stream
        start_stream()

        return True
    except Exception as e:
        print(f"Error configuring camera: {str(e)}")
        return False

def generate_frames():
    global frame_buffer
    prev_frame = None

    while stream_active:
        try:
            buffer = io.BytesIO()
            picam2.capture_file(buffer, format='jpeg')
            frame_data = buffer.getvalue()
            buffer.close()

            # Motion detection
            current_frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8), cv2.IMREAD_GRAYSCALE
            )

            if prev_frame is not None:
                detect_motion(current_frame, prev_frame)

            prev_frame = current_frame

            with buffer_lock:
                frame_buffer = frame_data
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_buffer + b'\r\n')

            time.sleep(1 / CONFIGS[current_config]['fps'])
        except Exception as e:
            print(f"Error generating frames: {str(e)}")
            break

def detect_motion(current_frame, prev_frame):
    global motion_state

    current_time = time.time()

    # First, check if we've exceeded MAX_RECORDING_DURATION
    if motion_state['recording'] and (current_time - motion_state['recording_start_time'] >= MAX_RECORDING_DURATION):
        print(f"Max duration ({MAX_RECORDING_DURATION}s) reached, stopping recording")
        stop_recording_and_post()
        # Don't immediately start a new recording - wait for new motion
        return

    # Check if frame sizes match
    if current_frame.shape != prev_frame.shape:
        print("Frame size mismatch, skipping motion detection.")
        return False

    # Compare current frame and previous frame
    delta_frame = cv2.absdiff(prev_frame, current_frame)
    thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
    motion_score = cv2.countNonZero(thresh)

    # Motion detection logic
    if motion_score > MOTION_THRESHOLD:
        motion_state['detected'] = True

        if not motion_state['recording']:
            # Start new recording
            start_recording()
        else:
            # Extend current recording
            motion_state['scheduled_stop_time'] = min(
                motion_state['recording_start_time'] + MAX_RECORDING_DURATION,
                current_time + RECORDING_EXTENSION
            )
    elif motion_state['recording']:
        # Check if we've reached the scheduled stop time
        if current_time >= motion_state['scheduled_stop_time']:
            stop_recording_and_post()

def start_recording():
    global motion_state

    try:
        # If there's already a recording, stop it first
        if motion_state['recording']:
            stop_recording_and_post()

        current_time = time.time()
        # Convert current_time to a human-readable ISO 8601 format
        motion_state['timestamp'] = datetime.utcfromtimestamp(current_time).strftime('%Y_%m_%dT%H_%M_%S')

        # Use the formatted timestamp for naming files
        motion_state['output_file'] = f"motion_{motion_state['timestamp']}.h264"

        motion_state['encoder'] = H264Encoder()
        picam2.start_encoder(
            motion_state['encoder'],
            FileOutput(motion_state['output_file'])
        )
        motion_state['recording'] = True
        motion_state['recording_start_time'] = current_time
        motion_state['scheduled_stop_time'] = min(
            current_time + MAX_RECORDING_DURATION,
            current_time + RECORDING_EXTENSION
        )
        print(f"Started recording: {motion_state['output_file']} at {motion_state['timestamp']}")
    except Exception as e:
        print(f"Error starting recording: {str(e)}")

def stop_recording_and_post():
    global motion_state

    if motion_state['recording']:
        try:
            # Stop encoder
            picam2.stop_encoder()

            # Reset recording state
            output_file = motion_state['output_file']
            motion_state['recording'] = False
            motion_state['detected'] = False

            # Upload video in a separate thread to not block the main process
            threading.Thread(
                target=upload_video,
                args=(output_file,),
                daemon=True
            ).start()
        except Exception as e:
            print(f"Error in stop_recording_and_post: {str(e)}")

def upload_video(output_file):
    try:
        print(f"Uploading {output_file} to {API_ENDPOINT}")
        with open(output_file, 'rb') as file:
            response = requests.post(API_ENDPOINT, files={"file": file}, verify=False)
            if response.status_code == 200:
                print("File uploaded successfully")
                # Remove file after successful upload
                os.remove(output_file)
            else:
                print(f"Failed to upload file: {response.status_code}")
    except Exception as e:
        print(f"Error uploading video: {str(e)}")

def start_stream():
    global stream_active

    if not stream_active:
        try:
            stream_active = True
            threading.Thread(target=generate_frames, daemon=True).start()
            picam2.start()
            return True
        except Exception as e:
            print(f"Error starting stream: {str(e)}")
            stream_active = False
            return False

def stop_stream():
    global stream_active

    if stream_active:
        try:
            stream_active = False
            stop_recording_and_post()
            picam2.stop()
            return True
        except Exception as e:
            print(f"Error stopping stream: {str(e)}")
            return False

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/configure/<config_name>')
def configure(config_name):
    global stream_id
    if config_name in CONFIGS:
        success = configure_camera(config_name)
        return jsonify({'success': success, 'stream_id': stream_id})
    return jsonify({'success': False})

if __name__ == '__main__':
    try:
        if not initialize_camera():
            print("Failed to initialize camera. Exiting.")
            sys.exit(1)

        if not configure_camera('1080p'):
            print("Failed to configure camera. Exiting.")
            sys.exit(1)

        port = 8080
        print(f"Starting server on port {port}")
        app.run(host='0.0.0.0', port=port, threaded=True)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        if stream_active:
            stop_stream()