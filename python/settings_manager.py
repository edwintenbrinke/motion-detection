import threading
import time
from typing import List, Dict
from config import Config

class SettingsManager:
    def __init__(self, api_client):
        self._api_client = api_client
        self._lock = threading.Lock()

        # Default values
        self._motion_threshold = 1000
        self._recording_extension = 5
        self._max_recording_duration = 60
        self._detection_area_points = []

        # Start update thread
        self._update_thread = threading.Thread(
            target=self._update_loop,
            daemon=True
        )
        self._update_thread.start()

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
                    self._recording_extension = response.get('recording_extension', self._recording_extension)
                    self._max_recording_duration = response.get('max_recording_duration', self._max_recording_duration)
                    self._detection_area_points = response.get('detection_area_points', self._detection_area_points)

                print("Settings updated successfully")
                print(f"Motion Threshold: {self._motion_threshold}")
                print(f"Recording Extension: {self._recording_extension}")
                print(f"Max Recording Duration: {self._max_recording_duration}")
                print(f"Detection Area Points: {len(self._detection_area_points)} points configured")
        except Exception as e:
            print(f"Error updating settings: {str(e)}")

    @property
    def motion_threshold(self) -> int:
        with self._lock:
            return self._motion_threshold

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
