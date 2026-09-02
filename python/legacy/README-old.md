# Raspberry Pi agent (python) — v1, frozen

This is the original agent's own README, unchanged, kept for reference while it is not run.
See [../README.md](../README.md) for where things stand now.

---

Captures frames, detects motion, records H.264 clips, uploads them to the API, and serves a
live MJPEG view on port 8080. Runs directly on the Pi — not in Docker, since it needs the
camera.

Full documentation: [../../docs/raspberry-pi.md](../../docs/raspberry-pi.md).

## Install

```bash
sudo apt install -y python3-picamera2 python3-opencv python3-flask python3-requests python3-numpy
```

`picamera2` must come from apt on Raspberry Pi OS, not pip. `requirements.txt` only lists
what the (camera-less) Docker image needs.

## Configure

Edit `config.py`: `BASE_URL` and `AUTH_CREDENTIALS` at minimum. Everything else — motion
thresholds, recording durations, the detection region — is managed from the app and polled
from the API every 60 seconds.

## Run

```bash
python3 main.py
```

| Endpoint         | What it serves                                    |
|------------------|---------------------------------------------------|
| `/`              | Live view page                                    |
| `/video_feed`    | MJPEG stream                                      |
| `/single_frame`  | One JPEG (used by the API for the region editor)  |
| `/debug_view`    | Live view with the ROI polygon drawn on it        |

None of these are authenticated. Keep the Pi on your LAN.

## Files

| File                            | Responsibility                                  |
|---------------------------------|-------------------------------------------------|
| `main.py`                       | Wiring and startup                              |
| `camera_manager.py`             | Picamera2, capture thread, frame queue          |
| `motion_detector.py`            | Frame differencing, ROI mask, recording state   |
| `video_handler.py`              | Encoder start/stop, background upload           |
| `api_client.py`                 | JWT auth, retries, upload, settings fetch       |
| `settings_manager.py`           | 60 s settings poll, thread-safe access          |
| `web_server.py`                 | Flask routes                                    |
| `config.py`                     | Backend URL, credentials, presets, bind address |
| `raspberry_stream_and_post.py`  | Original single-file prototype, kept for reference |
