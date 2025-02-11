import io
import time
import threading
import cv2
import numpy as np
from camera import picam2
from motion_detection import detect_motion
from config import CONFIGS

stream_active = False

def generate_frames():
    prev_frame = None
    while stream_active:
        try:
            buffer = io.BytesIO()
            picam2.capture_file(buffer, format='jpeg')
            frame_data = buffer.getvalue()
            buffer.close()

            current_frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8), cv2.IMREAD_GRAYSCALE
            )

            if prev_frame is not None:
                detect_motion(current_frame, prev_frame)

            prev_frame = current_frame

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')

            time.sleep(1 / CONFIGS['1080p']['fps'])  # Adjusted for dynamic FPS
        except Exception as e:
            print(f"Error generating frames: {str(e)}")
            break

def start_stream():
    global stream_active
    if not stream_active:
        try:
            stream_active = True
            threading.Thread(target=generate_frames, daemon=True).start()
            picam2.start()
        except Exception as e:
            print(f"Error starting stream: {str(e)}")

def stop_stream():
    global stream_active
    if stream_active:
        try:
            stream_active = False
            picam2.stop()
        except Exception as e:
            print(f"Error stopping stream: {str(e)}")
