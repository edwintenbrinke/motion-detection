from picamera2 import Picamera2
from picamera2.encoders import H264Encoder
from picamera2.outputs import FileOutput
import cv2
import numpy as np
import time
from datetime import datetime
import io
import threading
from config import Config

class CameraManager:
    def __init__(self):
        self.picam2 = None
        self.current_config = Config.DEFAULT_CONFIG
        self.stream_active = False
        self.frame_buffer = None
        self.buffer_lock = threading.Lock()
        self.stream_id = 0
        self.motion_detector = None  # Add this line

    def initialize(self):
        """Initialize the camera"""
        try:
            self.picam2 = Picamera2()
            return True
        except Exception as e:
            print(f"Failed to initialize camera: {str(e)}")
            return False

    def set_motion_detector(self, motion_detector):
        """Set the motion detector instance"""
        self.motion_detector = motion_detector

    def configure(self, config_name):
        """Configure camera with specific settings"""
        if config_name not in Config.CAMERA_CONFIGS:
            return False

        try:
            if self.stream_active:
                self.stop_stream()

            config = Config.CAMERA_CONFIGS[config_name]
            camera_config = self.picam2.create_video_configuration(
                main={"size": config['size']},
                controls={"FrameRate": config['fps']}
            )
            self.picam2.configure(camera_config)
            self.current_config = config_name
            self.stream_id += 1
            self.start_stream()
            return True
        except Exception as e:
            print(f"Error configuring camera: {str(e)}")
            return False

    def start_stream(self):
        """Start the camera stream"""
        if not self.stream_active:
            try:
                self.stream_active = True
                self.picam2.start()
                return True
            except Exception as e:
                print(f"Error starting stream: {str(e)}")
                self.stream_active = False
                return False

    def stop_stream(self):
        """Stop the camera stream"""
        if self.stream_active:
            try:
                self.stream_active = False
                self.picam2.stop()
                return True
            except Exception as e:
                print(f"Error stopping stream: {str(e)}")
                return False

    def capture_frame(self):
        """Capture a single frame"""
        try:
            buffer = io.BytesIO()
            self.picam2.capture_file(buffer, format='jpeg')
            frame_data = buffer.getvalue()
            buffer.close()

            # Process frame for motion detection
            if self.motion_detector:
                self.motion_detector.process_frame(frame_data)

            return frame_data
        except Exception as e:
            print(f"Error capturing frame: {str(e)}")
            return None

