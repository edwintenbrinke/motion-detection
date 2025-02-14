import sys
from camera_manager import CameraManager
from motion_detector import MotionDetector
from video_handler import VideoHandler
from web_server import WebServer
from config import Config

#pip install flask picamera2 opencv-python requests numpy

def main():
    try:
        # Initialize components
        camera_manager = CameraManager()
        if not camera_manager.initialize():
            print("Failed to initialize camera. Exiting.")
            sys.exit(1)

        # Initialize video handler first
        video_handler = VideoHandler(camera_manager.picam2)

        # Initialize motion detector with video handler
        motion_detector = MotionDetector(video_handler)

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