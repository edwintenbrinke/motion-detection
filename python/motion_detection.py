import time
import cv2
import threading
from datetime import datetime
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
from camera import picam2
from uploader import upload_video
import config

motion_state = {
    'detected': False,
    'recording': False,
    'last_motion_time': 0,
    'recording_start_time': 0,
    'scheduled_stop_time': 0,
    'output_file': None,
    'encoder': None
}

def detect_motion(current_frame, prev_frame):
    global motion_state
    current_time = time.time()

    delta_frame = cv2.absdiff(prev_frame, current_frame)
    thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
    motion_score = cv2.countNonZero(thresh)

    if motion_score > config.MOTION_THRESHOLD:
        motion_state['detected'] = True
        if not motion_state['recording']:
            start_recording()
        else:
            motion_state['scheduled_stop_time'] = current_time + config.RECORDING_EXTENSION

        if current_time - motion_state['recording_start_time'] >= config.MAX_RECORDING_DURATION:
            stop_recording_and_post()
            start_recording()
    elif motion_state['recording'] and current_time >= motion_state['scheduled_stop_time']:
        stop_recording_and_post()

def start_recording():
    global motion_state
    try:
        timestamp = datetime.now().strftime('%Y_%m_%dT%H_%M_%S')
        motion_state['output_file'] = f"motion_{timestamp}.h264"
        motion_state['encoder'] = H264Encoder()
        picam2.start_encoder(motion_state['encoder'], FileOutput(motion_state['output_file']))
        motion_state['recording'] = True
        motion_state['recording_start_time'] = time.time()
        print(f"Started recording: {motion_state['output_file']}")
    except Exception as e:
        print(f"Error starting recording: {str(e)}")

def stop_recording_and_post():
    global motion_state
    if motion_state['recording']:
        try:
            picam2.stop_encoder()
            motion_state['recording'] = False
            upload_video(motion_state['output_file'])
        except Exception as e:
            print(f"Error stopping recording: {str(e)}")
