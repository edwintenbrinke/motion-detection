import requests
import threading
import time
import config

def fetch_settings():
    """Fetch settings from the API and update global variables."""
    try:
        response = requests.get(config.API_SETTINGS_ENDPOINT, timeout=5)
        if response.status_code == 200:
            settings = response.json()

            # Update config dynamically
            config.MOTION_THRESHOLD = settings.get("motion_threshold", config.MOTION_THRESHOLD)
            config.RECORDING_EXTENSION = settings.get("recording_extension", config.RECORDING_EXTENSION)
            config.MAX_RECORDING_DURATION = settings.get("max_recording_duration", config.MAX_RECORDING_DURATION)

            print(f"Updated settings: MOTION_THRESHOLD={config.MOTION_THRESHOLD}, "
                  f"RECORDING_EXTENSION={config.RECORDING_EXTENSION}, "
                  f"MAX_RECORDING_DURATION={config.MAX_RECORDING_DURATION}")

        else:
            print(f"Failed to fetch settings. Status Code: {response.status_code}")

    except requests.RequestException as e:
        print(f"Error fetching settings: {str(e)}")

def periodic_settings_update(interval=60):
    """Periodically fetch settings from the API."""
    while True:
        fetch_settings()
        time.sleep(interval)  # Refresh settings every 60 seconds
