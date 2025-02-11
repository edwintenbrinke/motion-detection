from picamera2 import Picamera2
from config import CONFIGS

picam2 = None

def initialize_camera():
    global picam2
    try:
        picam2 = Picamera2()
        return True
    except Exception as e:
        print(f"Failed to initialize camera: {str(e)}")
        return False

def configure_camera(config_name):
    global picam2
    if picam2 is None:
        if not initialize_camera():
            return False

    config = CONFIGS[config_name]

    try:
        camera_config = picam2.create_video_configuration(
            main={"size": config['size']},
            controls={"FrameRate": config['fps']}
        )
        picam2.configure(camera_config)
        return True
    except Exception as e:
        print(f"Error configuring camera: {str(e)}")
        return False
