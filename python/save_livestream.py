import cv2
import numpy as np
import datetime
import time
import os
import glob
from queue import Queue
from threading import Thread

# Set the directory where files will be saved
SAVE_DIRECTORY = './recordings'
DAYS_TO_KEEP = 7
BUFFER_DURATION = 10
MOTION_THRESHOLD = 5000
PIXEL_THRESHOLD = 20
BLUR_SIZE = (5, 5)
DILATE_ITERATIONS = 3
LIVESTREAM_URL = 'http://192.168.1.221:8080/video_feed'
ROI = (100, 100, 400, 300)  # Example: (x, y, width, height)

class FrameGrabber:
    def __init__(self, src):
        self.cap = cv2.VideoCapture(src)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)  # Minimize buffer size
        
        # Get the actual framerate from the stream
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        print(f"Stream FPS: {self.fps}")
        
        self.q = Queue(maxsize=128)
        self.stopped = False
        
    def start(self):
        Thread(target=self.grab, daemon=True).start()
        return self

    def grab(self):
        while not self.stopped:
            if not self.q.full():
                ret, frame = self.cap.read()
                if ret:
                    self.q.put(frame)
                else:
                    print("Corrupt frame detected. Skipping...")
                    continue
            else:
                time.sleep(0.001)  # Short sleep to prevent CPU overload

    def get_frame(self):
        return self.q.get()

    def stop(self):
        self.stopped = True
        self.cap.release()

def flip_frame(frame):
    return cv2.flip(frame, -1)

def detect_motion(frame1, frame2, motion_threshold=MOTION_THRESHOLD, roi=None):
    diff = cv2.absdiff(frame1, frame2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, BLUR_SIZE, 0)
    _, thresh = cv2.threshold(blur, PIXEL_THRESHOLD, 255, cv2.THRESH_BINARY)
    dilated = cv2.dilate(thresh, None, iterations=DILATE_ITERATIONS)
    contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    
    important_detected = False
    for contour in contours:
        if cv2.contourArea(contour) > motion_threshold:
            # Get bounding box of contour
            x, y, w, h = cv2.boundingRect(contour)
            if roi:
                roi_x, roi_y, roi_w, roi_h = roi
                # Check if the bounding box intersects with the ROI
                if (x < roi_x + roi_w and x + w > roi_x and
                        y < roi_y + roi_h and y + h > roi_y):
                    important_detected = True
            else:
                return True  # Motion detected outside of ROI
            
    return important_detected

def delete_old_files():
    current_time = time.time()
    for file in glob.glob(os.path.join(SAVE_DIRECTORY, "motion_detected_*.mp4")):
        creation_time = os.path.getctime(file)
        if (current_time - creation_time) // (24 * 3600) >= DAYS_TO_KEEP:
            os.remove(file)
            print(f"Deleted old file: {file}")

def main():
    os.makedirs(SAVE_DIRECTORY, exist_ok=True)

    grabber = FrameGrabber(LIVESTREAM_URL)
    grabber.start()
    
    frame1 = flip_frame(grabber.get_frame())
    frame2 = flip_frame(grabber.get_frame())
    
    out = None
    recording = False
    important = False
    buffer_start_time = None
    last_cleanup_time = time.time()
    last_frame_time = time.time()
    fps = grabber.fps
    frame_interval = 1.0 / fps if fps > 0 else 0.02
    
    try:
        while True:
            current_time = time.time()
            
            if current_time - last_frame_time < frame_interval:
                time.sleep(0.001)
                continue
            
            important_detected = detect_motion(frame1, frame2, MOTION_THRESHOLD, ROI)
            general_motion_detected = detect_motion(frame1, frame2, MOTION_THRESHOLD)
            
            if important_detected or general_motion_detected or (recording and current_time - buffer_start_time < BUFFER_DURATION):
                if not recording:
                    recording = True
                    important = important_detected  # Save this state
                    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    prefix = "important_detected" if important else "motion_detected"
                    filename = f"{prefix}_{timestamp}.mp4"
                    file_path = os.path.join(SAVE_DIRECTORY, filename)
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    out = cv2.VideoWriter(file_path, fourcc, fps, (frame1.shape[1], frame1.shape[0]))
                    print(f"{'Important motion' if important else 'Motion'} detected! Recording to {file_path} at {fps} fps")
                
                out.write(frame2)
                
                if general_motion_detected or important_detected:
                    buffer_start_time = current_time
            else:
                if recording:
                    recording = False
                    important = False
                    out.release()
                    print("Motion stopped. Saving video.")
                    buffer_start_time = current_time
            
            frame1 = frame2
            frame2 = flip_frame(grabber.get_frame())
            last_frame_time = current_time
            
            if current_time - last_cleanup_time > 24 * 3600:
                delete_old_files()
                last_cleanup_time = current_time

    finally:
        grabber.stop()
        if out:
            out.release()

if __name__ == "__main__":
    main()