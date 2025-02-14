CONFIGS = {
    'full_res': {'size': (4608, 2592), 'fps': 15},
    '1080p': {'size': (1920, 1080), 'fps': 50},
    '720p': {'size': (1280, 720), 'fps': 100},
    '480p': {'size': (854, 480), 'fps': 120}
}

MOTION_THRESHOLD = 1000
RECORDING_EXTENSION = 5
MAX_RECORDING_DURATION = 60

API_VIDEO_ENDPOINT = "http://192.168.1.130/api/video/upload"
API_SETTINGS_ENDPOINT = "http://192.168.1.130/api/user/settings"
