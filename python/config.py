class Config:
    BASE_URL = "https://api.edwintenbrinke.nl"
    LOGIN_ENDPOINT = "/api/login"
    UPLOAD_ENDPOINT = "/api/video/upload"
    AUTH_CREDENTIALS = {
        "username": "admin",
        "password": "admin"
    }
    MAX_RETRY_ATTEMPTS = 3
    RETRY_DELAY = 1  # seconds

    # Camera Configuration
    CAMERA_CONFIGS = {
        'full_res': {'size': (4608, 2592), 'fps': 15},
        '1080p': {'size': (1920, 1080), 'fps': 50},
        '720p': {'size': (1280, 720), 'fps': 100},
        '480p': {'size': (854, 480), 'fps': 120}
    }
    DEFAULT_CONFIG = '1080p'

    # Motion Detection Configuration
    MOTION_THRESHOLD = 1000
    RECORDING_EXTENSION = 5
    MAX_RECORDING_DURATION = 60

    # Server Configuration
    SERVER_HOST = '0.0.0.0'
    SERVER_PORT = 8080