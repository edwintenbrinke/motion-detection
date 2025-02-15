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
            'last_motion_time': 0,
            'roi_triggered': False  # New state to track ROI triggers
        }
        self.prev_frame = None
        self.frame_dimensions = None
        self.roi_mask = None

    def _create_roi_mask(self, frame_shape):
        """Create a binary mask for the region of interest"""
        if not self.settings_manager.detection_area_points:
            return None

        height, width = frame_shape[:2]
        points = []

        # Convert normalized coordinates to pixel coordinates
        for point in self.settings_manager.detection_area_points:
            x = int(point['x'] * width)
            y = int(point['y'] * height)
            points.append([x, y])

        # Create binary mask
        mask = np.zeros((height, width), dtype=np.uint8)
        points_array = np.array(points, dtype=np.int32)
        cv2.fillPoly(mask, [points_array], 255)

        return mask

    def process_frame(self, frame_data):
        """Process a frame for motion detection"""
        try:
            current_frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8),
                cv2.IMREAD_GRAYSCALE
            )

            # Initialize ROI mask if needed
            if self.roi_mask is None and self.settings_manager.detection_area_points:
                self.roi_mask = self._create_roi_mask(current_frame.shape)

            if self.prev_frame is not None:
                self.detect_motion(current_frame)

            self.prev_frame = current_frame

        except Exception as e:
            print(f"Error processing frame: {str(e)}")

    def detect_motion(self, current_frame):
        """Detect motion between frames with ROI support"""
        try:
            current_time = time.time()

            # Compare frames
            if current_frame.shape != self.prev_frame.shape:
                print("Frame shape mismatch")
                return False

            delta_frame = cv2.absdiff(self.prev_frame, current_frame)
            thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]

            # Calculate motion score for entire frame
            motion_score = cv2.countNonZero(thresh)

            # Calculate motion score for ROI if mask exists
            roi_triggered = False
            if self.roi_mask is not None:
                roi_thresh = cv2.bitwise_and(thresh, thresh, mask=self.roi_mask)
                roi_motion_score = cv2.countNonZero(roi_thresh)
                roi_triggered = roi_motion_score > (self.settings_manager.motion_threshold * 0.5)  # Use lower threshold for ROI

                if roi_triggered:
                    print(f"ROI motion detected! Score: {roi_motion_score}")

            # Motion detected in full frame
            if motion_score > self.settings_manager.motion_threshold:
                self.state['detected'] = True
                self.state['last_motion_time'] = current_time

                if not self.state['recording']:
                    # Start new recording
                    print("Starting new recording")
                    self.video_handler.start_recording(roi_triggered=roi_triggered)
                    self.state['recording'] = True
                    self.state['recording_start_time'] = current_time
                    self.state['scheduled_stop_time'] = current_time + self.settings_manager.recording_extension
                else:
                    # Update ROI triggered state if it occurs during recording
                    if roi_triggered and not self.state['roi_triggered']:
                        self.state['roi_triggered'] = True
                        self.video_handler.roi_triggered = True

                    # Already recording, extend the stop time
                    new_stop_time = current_time + self.settings_manager.recording_extension
                    max_stop_time = self.state['recording_start_time'] + self.settings_manager.max_recording_duration
                    self.state['scheduled_stop_time'] = min(new_stop_time, max_stop_time)

            # Check if we should stop recording
            if self.state['recording']:
                # Stop if we've reached max duration
                if current_time - self.state['recording_start_time'] >= self.settings_manager.max_recording_duration:
                    print(f"Stopping recording - reached max duration of {self.settings_manager.max_recording_duration}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False
                    self.state['roi_triggered'] = False
                # Stop if no motion for RECORDING_EXTENSION seconds
                elif current_time >= self.state['scheduled_stop_time']:
                    print(f"Stopping recording - no motion for {self.settings_manager.recording_extension}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False
                    self.state['roi_triggered'] = False

        except Exception as e:
            print(f"Error in detect_motion: {str(e)}")