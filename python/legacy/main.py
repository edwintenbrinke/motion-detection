import sys
from camera_manager import CameraManager
from motion_detector import MotionDetector
from video_handler import VideoHandler
from web_server import WebServer
from settings_manager import SettingsManager
from api_client import APIClient
from config import Config

import builtins
import datetime

original_print = builtins.print

def new_print(*args, **kwargs):
    original_print(f"[{datetime.datetime.now()}]", *args, **kwargs)

builtins.print = new_print

#pip install flask picamera2 opencv-python requests numpy

def main():
    try:
        # Initialize components
        camera_manager = CameraManager()
        if not camera_manager.initialize():
            print("Failed to initialize camera. Exiting.")
            sys.exit(1)

        # Initialize API client
        api_client = APIClient()

        # Initialize settings manager
        settings_manager = SettingsManager(api_client)

        # Initialize video handler
        video_handler = VideoHandler(camera_manager.picam2)

        # Initialize motion detector with video handler and settings manager
        motion_detector = MotionDetector(video_handler, settings_manager)

        # Connect motion detector to camera manager
        camera_manager.set_motion_detector(motion_detector)

        # Configure camera with default settings
        if not camera_manager.configure(Config.DEFAULT_CONFIG):
            print("Failed to configure camera. Exiting.")
            sys.exit(1)

        # Initialize web server
        web_server = WebServer(camera_manager)

        # Start web server
        print(f"Starting server on port {Config.SERVER_PORT}")
        web_server.run()

    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        if camera_manager.stream_active:
            camera_manager.stop_stream()

if __name__ == '__main__':
    main()