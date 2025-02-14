from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
from queue import Queue
import cv2
import numpy as np
import time
from datetime import datetime
import io
import threading
from config import Config

class CameraManager:
    def __init__(self):
        self.stream_active = False
        self.motion_detector = None
        self.picam2 = None
        self.stream_id = None
        self.frame_queue = Queue(maxsize=2)  # Buffer for latest frame
        self.motion_detection_thread = None
        self.should_run = False

    def initialize(self):
        try:
            from picamera2 import Picamera2
            self.picam2 = Picamera2()
            self.stream_active = True
            self.should_run = True
            # Start the continuous capture thread
            self.motion_detection_thread = Thread(target=self._continuous_capture, daemon=True)
            self.motion_detection_thread.start()
            return True
        except Exception as e:
            print(f"Failed to initialize camera: {str(e)}")
            return False

    def set_motion_detector(self, detector):
        self.motion_detector = detector

    def _continuous_capture(self):
        """Continuously capture frames and process them for motion detection"""
        while self.should_run:
            try:
                frame_data = self.capture_frame()
                if frame_data:
                    # Update the frame queue with the latest frame
                    if self.frame_queue.full():
                        self.frame_queue.get()  # Remove old frame
                    self.frame_queue.put(frame_data)

                    # Process frame for motion detection
                    if self.motion_detector:
                        self.motion_detector.process_frame(frame_data)

                time.sleep(1/30)  # Limit to ~30 FPS
            except Exception as e:
                print(f"Error in continuous capture: {str(e)}")
                time.sleep(1)  # Wait before retrying

    def capture_frame(self):
        """Capture a single frame from the camera"""
        try:
            if not self.stream_active:
                return None

            # Capture frame from picamera2
            frame = self.picam2.capture_array()
            # Convert to BGR format for OpenCV processing
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
            # Encode as JPEG
            _, buffer = cv2.imencode('.jpg', frame_bgr)
            return buffer.tobytes()
        except Exception as e:
            print(f"Error capturing frame: {str(e)}")
            return None

    def configure(self, config_name):
        try:
            # Apply camera configuration
            self.picam2.configure(config_name)
            self.picam2.start()
            self.stream_id = time.time()
            return True
        except Exception as e:
            print(f"Error configuring camera: {str(e)}")
            return False

    def get_latest_frame(self):
        """Get the most recent frame for the web feed"""
        try:
            return self.frame_queue.get_nowait()
        except:
            return None

    def stop_stream(self):
        """Clean shutdown of camera and threads"""
        self.should_run = False
        self.stream_active = False
        if self.motion_detection_thread:
            self.motion_detection_thread.join(timeout=1.0)
        if self.picam2:
            self.picam2.stop()
            self.picam2.close()