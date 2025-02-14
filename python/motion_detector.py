import cv2
import numpy as np
import time
from datetime import datetime
from config import Config

class MotionDetector:
    def __init__(self, video_handler, settings_manager):
        self.video_handler = video_handler
        self.settings_manager = settings_manager
        self.state = {
            'detected': False,
            'recording': False,
            'recording_start_time': 0,
            'scheduled_stop_time': 0,
            'last_motion_time': 0
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
        try:
            current_time = time.time()

            # Compare frames
            if current_frame.shape != self.prev_frame.shape:
                print("Frame shape mismatch")
                return False

            delta_frame = cv2.absdiff(self.prev_frame, current_frame)
            thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
            motion_score = cv2.countNonZero(thresh)

            # Motion detected
            if motion_score > self.settings_manager.motion_threshold:
                # print(f"Motion detected! Score: {motion_score}")
                self.state['detected'] = True
                self.state['last_motion_time'] = current_time

                if not self.state['recording']:
                    # Start new recording
                    print("Starting new recording")
                    self.video_handler.start_recording()
                    self.state['recording'] = True
                    self.state['recording_start_time'] = current_time
                    self.state['scheduled_stop_time'] = current_time + self.settings_manager.recording_extension
                else:
                    # Already recording, extend the stop time
                    new_stop_time = current_time + self.settings_manager.recording_extension
                    max_stop_time = self.state['recording_start_time'] + self.settings_manager.max_recording_duration

                    # Don't extend beyond max duration
                    self.state['scheduled_stop_time'] = min(new_stop_time, max_stop_time)

            # Check if we should stop recording
            if self.state['recording']:
                # Stop if we've reached max duration
                if current_time - self.state['recording_start_time'] >= self.settings_manager.max_recording_duration:
                    print(f"Stopping recording - reached max duration of {self.settings_manager.max_recording_duration}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False
                # Stop if no motion for RECORDING_EXTENSION seconds
                elif current_time >= self.state['scheduled_stop_time']:
                    print(f"Stopping recording - no motion for {self.settings_manager.recording_extension}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False

        except Exception as e:
            print(f"Error in detect_motion: {str(e)}")