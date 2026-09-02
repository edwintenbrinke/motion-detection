import threading
import time
from typing import List, Dict
from config import Config

class SettingsManager:
    def __init__(self, api_client):
        self._api_client = api_client
        self._lock = threading.Lock()
        self._observers = []  # List to hold observer callbacks

        # Default values
        self._motion_threshold = 1000
        self._roi_motion_threshold = 500
        self._recording_extension = 5
        self._max_recording_duration = 60
        self._detection_area_points = []
        self._last_points_hash = self._hash_points(self._detection_area_points)

        # Start update thread
        self._update_thread = threading.Thread(
            target=self._update_loop,
            daemon=True
        )
        self._update_thread.start()

    def _hash_points(self, points: List[Dict[str, float]]) -> str:
        """Create a hash of points to detect changes"""
        if not points:
            return ""
        # Convert points to tuples and create a hash
        return hash(tuple(tuple(sorted(point.items())) for point in sorted(points, key=lambda x: (x['x'], x['y']))))

    def add_observer(self, callback):
        """Add an observer to be notified of ROI changes"""
        self._observers.append(callback)

    def _notify_roi_change(self):
        """Notify all observers of ROI change"""
        for callback in self._observers:
            callback()

    def _update_loop(self):
        """Background thread to update settings periodically"""
        while True:
            self.update_settings()
            time.sleep(Config.SETTINGS_UPDATE_INTERVAL)

    def update_settings(self):
        """Fetch and update settings from API"""
        try:
            response = self._api_client.get_settings()

            if response:
                with self._lock:
                    self._motion_threshold = response.get('motion_threshold', self._motion_threshold)
                    self._roi_motion_threshold = response.get('roi_motion_threshold', self._roi_motion_threshold)
                    self._recording_extension = response.get('recording_extension', self._recording_extension)
                    self._max_recording_duration = response.get('max_recording_duration', self._max_recording_duration)

                    new_points = response.get('detection_area_points', self._detection_area_points)
                    new_points_hash = self._hash_points(new_points)

                    if new_points_hash != self._last_points_hash:
                        self._detection_area_points = new_points
                        self._last_points_hash = new_points_hash
                        self._notify_roi_change()
                        print("Detection area points changed, updating ROI mask")

        except Exception as e:
            print(f"Error updating settings: {str(e)}")

    @property
    def motion_threshold(self) -> int:
        with self._lock:
            return self._motion_threshold

    @property
    def roi_motion_threshold(self) -> int:
        with self._lock:
            return self._roi_motion_threshold

    @property
    def recording_extension(self) -> int:
        with self._lock:
            return self._recording_extension

    @property
    def max_recording_duration(self) -> int:
        with self._lock:
            return self._max_recording_duration

    @property
    def detection_area_points(self) -> List[Dict[str, float]]:
        with self._lock:
            return self._detection_area_points.copy()  # Return a copy to prevent external modification
