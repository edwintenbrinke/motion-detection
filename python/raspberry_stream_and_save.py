from picamera2 import Picamera2, Preview
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
from flask import Flask, Response, jsonify
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
MOTION_THRESHOLD = 1000  # Amount of pixel change to trigger motion
MOTION_COOLDOWN = 5      # Seconds to wait before allowing new recording
NO_MOTION_DURATION = 3   # Seconds to wait for motion to stop recording
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
    'last_recording_time': 0,
    'output_file': None,
    'encoder': None
}

# API endpoint
API_ENDPOINT = "http://your-api-endpoint.com/upload"

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

    # Check if frame sizes match
    if current_frame.shape != prev_frame.shape:
        print("Frame size mismatch, skipping motion detection.")
        return False

    # Compare current frame and previous frame
    delta_frame = cv2.absdiff(prev_frame, current_frame)
    thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
    motion_score = cv2.countNonZero(thresh)

    # Motion detection logic with cooldown and max recording duration
    if motion_score > MOTION_THRESHOLD:
        # Check if enough time has passed since last recording
        if (not motion_state['recording'] and
            current_time - motion_state['last_recording_time'] >= MOTION_COOLDOWN):
            start_recording()

        # Update last motion time
        motion_state['last_motion_time'] = current_time
        motion_state['detected'] = True

    # Check for recording stop conditions
    if motion_state['recording']:
        # Stop recording if no motion for specified duration
        if current_time - motion_state['last_motion_time'] > NO_MOTION_DURATION:
            stop_recording_and_post()

        # Stop recording if max duration reached
        if current_time - motion_state['recording_start_time'] > MAX_RECORDING_DURATION:
            stop_recording_and_post()

def start_recording():
    global motion_state

    try:
        current_time = time.time()
        motion_state['output_file'] = f"motion_{int(current_time)}.h264"
        motion_state['encoder'] = H264Encoder()
        picam2.start_encoder(
            motion_state['encoder'],
            FileOutput(motion_state['output_file'])
        )
        motion_state['recording'] = True
        motion_state['recording_start_time'] = current_time
        motion_state['last_recording_time'] = current_time
        print(f"Started recording: {motion_state['output_file']}")
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

            # Upload video to API
            print(f"Uploading {output_file} to {API_ENDPOINT}")
            with open(output_file, 'rb') as file:
                response = requests.post(API_ENDPOINT, files={"file": file})
                if response.status_code == 200:
                    print("File uploaded successfully")
                    # Remove file after successful upload
                    os.remove(output_file)
                else:
                    print(f"Failed to upload file: {response.status_code}")
        except Exception as e:
            print(f"Error in stop_recording_and_post: {str(e)}")

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
    return '''
    <html>
        <head>
            <title>Pi Camera Stream</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 20px;
                    background-color: #f0f0f0;
                }
                .container {
                    margin: 0 auto;
                    padding: 20px;
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                select {
                    margin: 10px 0;
                    padding: 8px;
                    border-radius: 4px;
                    border: 1px solid #ddd;
                }
                #stream-container {
                    position: relative;
                    margin-top: 20px;
                }
                #stream {
                    max-width: 100%;
                    border-radius: 4px;
                    transform: scale(-1, -1);
                }
                .error {
                    color: red;
                    margin-top: 10px;
                }
                .status {
                    color: #666;
                    margin-top: 10px;
                }
                #loading {
                    display: none;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(255,255,255,0.8);
                    padding: 20px;
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Pi Camera Stream</h1>
                <select id="resolution" onchange="changeConfig(this.value)">
                    <option value="1080p">1080p50</option>
                    <option value="full_res">Full Resolution (4608x2592)</option>
                    <option value="720p">720p100</option>
                    <option value="480p">480p120</option>
                </select>
                <div id="error" class="error"></div>
                <div id="status" class="status"></div>
                <div id="stream-container">
                    <img id="stream" src="/video_feed">
                    <div id="loading">Changing configuration...</div>
                </div>
            </div>

            <script>
                let currentStreamId = 0;

                function updateStatus(message) {
                    document.getElementById('status').textContent = message;
                }

                function showLoading() {
                    document.getElementById('loading').style.display = 'block';
                    document.getElementById('stream').style.opacity = '0.5';
                }

                function hideLoading() {
                    document.getElementById('loading').style.display = 'none';
                    document.getElementById('stream').style.opacity = '1';
                }

                async function changeConfig(config) {
                    try {
                        showLoading();
                        updateStatus('Changing configuration...');

                        const response = await fetch('/configure/' + config);
                        const data = await response.json();

                        if (data.success) {
                            document.getElementById('error').textContent = '';
                            updateStatus('Configuration changed successfully. Reloading stream...');

                            // Update stream source with new stream ID
                            const streamImg = document.getElementById('stream');
                            streamImg.src = '/video_feed?id=' + data.stream_id;

                            // Add load event listener to hide loading overlay
                            streamImg.onload = function() {
                                hideLoading();
                                updateStatus('Stream active: ' + config);
                            };

                            // Add error event listener
                            streamImg.onerror = function() {
                                hideLoading();
                                document.getElementById('error').textContent = 'Failed to load stream';
                                updateStatus('Stream error');
                            };
                        } else {
                            document.getElementById('error').textContent = 'Failed to change configuration';
                            hideLoading();
                            updateStatus('Configuration change failed');
                        }
                    } catch (error) {
                        document.getElementById('error').textContent = 'Error: ' + error.message;
                        hideLoading();
                        updateStatus('Error occurred');
                    }
                }
            </script>
        </body>
    </html>
    '''

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
