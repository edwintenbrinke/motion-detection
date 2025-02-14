import cv2
import numpy as np
import time
from datetime import datetime
from config import Config

class MotionDetector:
    def __init__(self, video_handler):
        self.video_handler = video_handler
        self.state = {
            'detected': False,
            'recording': False,
            'last_motion_time': 0,
            'recording_start_time': 0,
            'scheduled_stop_time': 0,
            'output_file': None,
            'encoder': None
        }
        self.prev_frame = None

    def process_frame(self, frame_data):
        """Process a frame for motion detection"""
        try:
            current_frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8),
                cv2.IMREAD_GRAYSCALE
            )

            if self.prev_frame is not None:
                self.detect_motion(current_frame)

            self.prev_frame = current_frame

        except Exception as e:
            print(f"Error processing frame: {str(e)}")

    def detect_motion(self, current_frame):
        """Detect motion between frames"""
        current_time = time.time()

        # Check max duration
        if (self.state['recording'] and
            (current_time - self.state['recording_start_time'] >= Config.MAX_RECORDING_DURATION)):
            print(f"Max duration ({Config.MAX_RECORDING_DURATION}s) reached")
            self.video_handler.stop_recording()
            return

        # Compare frames
        if current_frame.shape != self.prev_frame.shape:
            return False

        delta_frame = cv2.absdiff(self.prev_frame, current_frame)
        thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
        motion_score = cv2.countNonZero(thresh)

        if motion_score > Config.MOTION_THRESHOLD:
            self.state['detected'] = True
            if not self.state['recording']:
                self.video_handler.start_recording()
            else:
                self.state['scheduled_stop_time'] = min(
                    self.state['recording_start_time'] + Config.MAX_RECORDING_DURATION,
                    current_time + Config.RECORDING_EXTENSION
                )
        elif self.state['recording']:
            if current_time >= self.state['scheduled_stop_time']:
                self.video_handler.stop_recording()