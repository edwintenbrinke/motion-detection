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
            'roi_triggered': False,
            'recording': False,
            'recording_start_time': 0,
            'scheduled_stop_time': 0,
            'last_motion_time': 0
        }
        self.prev_frame = None
        self.roi_mask = None
        self.frame_shape = None
        self.roi_threshold = 1000  # Adjust this value based on testing

    def _create_roi_mask(self, frame_shape):
        """Create a binary mask from the detection area points"""
        height, width = frame_shape[:2]
        points = self.settings_manager.detection_area_points

        # Convert relative coordinates to absolute pixel coordinates
        polygon_points = []
        for point in points:
            x = int(point['x'] * width)
            y = int(point['y'] * height)
            polygon_points.append([x, y])

        # Create mask
        mask = np.zeros((height, width), dtype=np.uint8)
        polygon_points = np.array(polygon_points, np.int32)
        cv2.fillPoly(mask, [polygon_points], 255)

        return mask

    def process_frame(self, frame_data):
        """Process a frame for motion detection"""
        try:
            current_frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8),
                cv2.IMREAD_GRAYSCALE
            )

            # Initialize ROI mask if needed
            if self.roi_mask is None or self.frame_shape != current_frame.shape:
                self.frame_shape = current_frame.shape
                self.roi_mask = self._create_roi_mask(current_frame.shape)

            if self.prev_frame is not None:
                self.detect_motion(current_frame)

            self.prev_frame = current_frame

        except Exception as e:
            print(f"Error processing frame: {str(e)}")

    def detect_motion(self, current_frame):
        """Detect motion between frames with polygon ROI support"""
        try:
            current_time = time.time()

            # Compare frames
            if current_frame.shape != self.prev_frame.shape:
                print("Frame shape mismatch")
                return False

            # Calculate motion for entire frame
            delta_frame = cv2.absdiff(self.prev_frame, current_frame)
            thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]
            motion_score = cv2.countNonZero(thresh)

            # Calculate motion specifically in ROI
            roi_delta = cv2.bitwise_and(delta_frame, delta_frame, mask=self.roi_mask)
            roi_thresh = cv2.threshold(roi_delta, 25, 255, cv2.THRESH_BINARY)[1]
            roi_motion_score = cv2.countNonZero(roi_thresh)

            # Update ROI state
            self.state['roi_triggered'] = roi_motion_score > self.roi_threshold

            # Motion detected
            if motion_score > self.settings_manager.motion_threshold:
                self.state['detected'] = True
                self.state['last_motion_time'] = current_time

                if not self.state['recording']:
                    print(f"Starting new recording (ROI triggered: {self.state['roi_triggered']}, ROI score: {roi_motion_score})")
                    self.video_handler.start_recording(roi_triggered=self.state['roi_triggered'])
                    self.state['recording'] = True
                    self.state['recording_start_time'] = current_time
                    self.state['scheduled_stop_time'] = current_time + self.settings_manager.recording_extension
                else:
                    new_stop_time = current_time + self.settings_manager.recording_extension
                    max_stop_time = self.state['recording_start_time'] + self.settings_manager.max_recording_duration
                    self.state['scheduled_stop_time'] = min(new_stop_time, max_stop_time)

            # Check if we should stop recording
            if self.state['recording']:
                if current_time - self.state['recording_start_time'] >= self.settings_manager.max_recording_duration:
                    print(f"Stopping recording - reached max duration of {self.settings_manager.max_recording_duration}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False
                    self.state['roi_triggered'] = False
                elif current_time >= self.state['scheduled_stop_time']:
                    print(f"Stopping recording - no motion for {self.settings_manager.recording_extension}s")
                    self.video_handler.stop_recording()
                    self.state['recording'] = False
                    self.state['detected'] = False
                    self.state['roi_triggered'] = False

        except Exception as e:
            print(f"Error in detect_motion: {str(e)}")

    def create_debug_frame(self, frame_data):
        """Create a debug frame with ROI visualization"""
        try:
            # Decode frame to BGR for colored visualization
            frame = cv2.imdecode(
                np.frombuffer(frame_data, np.uint8),
                cv2.IMREAD_COLOR
            )

            height, width = frame.shape[:2]

            # Draw ROI polygon
            points = self.settings_manager.detection_area_points
            polygon_points = []
            for point in points:
                x = int(point['x'] * width)
                y = int(point['y'] * height)
                polygon_points.append([x, y])

            polygon_points = np.array(polygon_points, np.int32)

            # Create a copy of the frame for visualization
            debug_frame = frame.copy()

            # Draw filled polygon with transparency
            overlay = debug_frame.copy()
            cv2.fillPoly(overlay, [polygon_points], (0, 255, 0))  # Green fill
            cv2.addWeighted(overlay, 0.3, debug_frame, 0.7, 0, debug_frame)

            # Draw polygon outline
            cv2.polylines(debug_frame, [polygon_points], True, (0, 255, 0), 2)

            # Add text for motion scores if we have previous frame
            if self.prev_frame is not None:
                current_frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                delta_frame = cv2.absdiff(self.prev_frame, current_frame_gray)
                thresh = cv2.threshold(delta_frame, 25, 255, cv2.THRESH_BINARY)[1]

                # Calculate scores
                total_motion = cv2.countNonZero(thresh)
                roi_motion = cv2.countNonZero(cv2.bitwise_and(thresh, thresh, mask=self.roi_mask))

                # Add text
                cv2.putText(debug_frame, f"Total Motion: {total_motion}", (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(debug_frame, f"ROI Motion: {roi_motion}", (10, 70),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                cv2.putText(debug_frame, f"ROI Triggered: {self.state['roi_triggered']}", (10, 110),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            # Encode the debug frame as JPEG
            _, buffer = cv2.imencode('.jpg', debug_frame)
            return buffer.tobytes()

        except Exception as e:
            print(f"Error creating debug frame: {str(e)}")
            return frame_data  # Return original frame if error occurs