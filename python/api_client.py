import requests
import time
from datetime import datetime
import os
from config import Config

class APIClient:
    def __init__(self):
        self.token = None
        self.base_url = Config.BASE_URL
        self._authenticate()

    def _authenticate(self):
        """Authenticate and get JWT token"""
        try:
            response = requests.post(
                f"{self.base_url}{Config.LOGIN_ENDPOINT}",
                json=Config.AUTH_CREDENTIALS
            )
            response.raise_for_status()
            data = response.json()
            self.token = data['token']
            return True
        except Exception as e:
            print(f"Authentication failed: {str(e)}")
            return False

    def _make_request(self, method, endpoint, **kwargs):
        """Make HTTP request with retry logic for unauthorized responses"""
        if not self.token:
            if not self._authenticate():
                raise Exception("Failed to authenticate")

        # Add authorization header
        headers = kwargs.get('headers', {})
        headers['Authorization'] = self.token
        kwargs['headers'] = headers

        for attempt in range(Config.MAX_RETRY_ATTEMPTS):
            try:
                response = method(f"{self.base_url}{endpoint}", **kwargs)
                
                if response.status_code == 401:  # Unauthorized
                    print("Token expired, reauthenticating...")
                    if self._authenticate():
                        # Update header with new token and retry
                        kwargs['headers']['Authorization'] = self.token
                        continue
                
                response.raise_for_status()
                return response
                
            except requests.exceptions.RequestException as e:
                if attempt == Config.MAX_RETRY_ATTEMPTS - 1:
                    raise
                print(f"Request failed (attempt {attempt + 1}/{Config.MAX_RETRY_ATTEMPTS}): {str(e)}")
                time.sleep(Config.RETRY_DELAY)

        raise Exception("Max retry attempts reached")

    def upload_video(self, file_path, timestamp=None):
        """Upload video file to server"""
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Video file not found: {file_path}")

            with open(file_path, 'rb') as file:
                files = {'file': file}
                response = self._make_request(
                    requests.post,
                    Config.UPLOAD_ENDPOINT,
                    files=files,
                    verify=False
                )

            if response.status_code == 200:
                print(f"Successfully uploaded {file_path}")
                # Remove file after successful upload
                os.remove(file_path)
                return True
            else:
                print(f"Failed to upload {file_path}: {response.status_code}")
                return False

        except Exception as e:
            print(f"Error uploading video: {str(e)}")
            return False

    def get_settings(self):
        """Fetch settings from the API"""
        try:
            response = self._make_request(
                requests.get,
                Config.SETTINGS_ENDPOINT
            )

            if response.status_code == 200:
                return response.json()
            return None
        except Exception as e:
            print(f"Error fetching settings: {str(e)}")
            return None