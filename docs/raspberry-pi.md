# Raspberry Pi agent

The agent in `python/` is the only part that touches hardware. It captures frames, decides
when something moved, records H.264 clips, uploads them, and serves a live MJPEG view.

## Starting it

```bash
cd ~/motion-detection
python3 main.py
```

`main.py` builds the object graph in this order, and exits if the camera fails to
initialize or configure:

```
CameraManager.initialize()   → Picamera2 + capture thread
APIClient()                  → logs in, stores the JWT
SettingsManager(api_client)  → first fetch + 60 s poll thread
VideoHandler(picam2)         → owns the encoder
MotionDetector(handler, settings)
CameraManager.configure(Config.DEFAULT_CONFIG)
WebServer(camera_manager).run()   → Flask on 0.0.0.0:8080, blocks
```

All `print()` output is prefixed with a timestamp (`main.py` monkey-patches `print`), so
piping to a log file or journald gives you readable output.

## HTTP endpoints on the Pi

These are served on port 8080 and are **not authenticated** — keep the Pi on your LAN.

| Endpoint                 | Returns                                                        |
|--------------------------|----------------------------------------------------------------|
| `GET /`                  | A minimal HTML page with the live view                         |
| `GET /video_feed`        | MJPEG stream (`multipart/x-mixed-replace; boundary=frame`)     |
| `GET /single_frame`      | One JPEG; used by the API for the ROI placeholder image        |
| `GET /debug_frame`       | One JPEG with the ROI polygon and motion status drawn on it    |
| `GET /debug_view`        | HTML page around `/debug_frame`                                |
| `GET /configure/<name>`  | Reconfigures the camera; name must be a key of `CAMERA_CONFIGS` |

`/debug_view` is the fastest way to check that your ROI polygon landed where you meant it
to: the region is tinted green with a red outline, and the overlay text shows whether motion
and ROI motion are currently triggering.

## How detection works

`MotionDetector.detect_motion` runs on every captured frame:

1. `cv2.absdiff` between the current and previous grayscale frame.
2. `cv2.threshold(..., 25, 255, THRESH_BINARY)` — pixels that changed by more than 25.
3. `cv2.countNonZero` gives the **motion score**: the number of changed pixels.
4. If an ROI mask exists, the same count is taken inside the mask only.

Then:

| Condition                                                   | Effect                                    |
|-------------------------------------------------------------|-------------------------------------------|
| `motion_score > motion_threshold`                           | Start recording, or extend the stop time  |
| `roi_score > roi_motion_threshold * 0.5`                    | Mark the clip **important**               |
| Recording, and `now >= scheduled_stop_time`                 | Stop (quiet for `recording_extension` s)  |
| Recording, and `now - start >= max_recording_duration`      | Stop (hit the ceiling)                    |

Two details worth knowing:

- The ROI comparison uses `motion_threshold * 0.5`, **not** the `roi_motion_threshold`
  setting. `SettingsManager` fetches and exposes `roi_motion_threshold`, but
  `detect_motion` does not currently read it. If ROI sensitivity does not respond to that
  setting, this is why.
- A clip can be promoted to important mid-recording: if ROI motion starts after the
  recording began, `state['roi_triggered']` and `video_handler.roi_triggered` are set, and
  the upload carries the new value.

## Settings the Pi pulls from the API

`SettingsManager` calls `GET /api/user/settings` every 60 seconds
(`Config.SETTINGS_UPDATE_INTERVAL`) and reads:

| Key                      | Default | Meaning                                                     |
|--------------------------|---------|-------------------------------------------------------------|
| `motion_threshold`       | 1000    | Changed pixels needed to trigger a recording                 |
| `roi_motion_threshold`   | 500     | Fetched and exposed, but see the note above                  |
| `recording_extension`    | 5       | Seconds of quiet before a recording stops                    |
| `max_recording_duration` | 60      | Hard cap on a single clip, in seconds                        |
| `detection_area_points`  | `[]`    | ROI polygon, normalized `{"x": 0..1, "y": 0..1}` points      |

Defaults apply until the first successful fetch, so a backend outage degrades to sane
behaviour rather than stopping detection.

When the polygon changes, the manager hashes it, notices the difference and calls the
observers registered with `add_observer` — which clears the ROI mask so the next frame
rebuilds it at the current resolution. No restart needed after editing the region in the
app; it takes effect within a minute.

## Tuning

`motion_threshold` counts pixels, so its useful range depends on resolution. At 1080p a
frame is about 2 million pixels; the fixture default of 5000 is roughly 0.25% of the frame.

| Symptom                                     | Try                                             |
|---------------------------------------------|-------------------------------------------------|
| Constant recordings from noise, rain, trees | Raise `motion_threshold`                        |
| Misses people walking through               | Lower `motion_threshold`                        |
| Clips cut off mid-event                     | Raise `recording_extension`                     |
| One long clip covers many separate events   | Lower `recording_extension`                     |
| Huge files, disk fills quickly              | Lower `max_recording_duration`, or the resolution |
| Everything is marked important              | Shrink the ROI polygon                          |

Night-time IR illumination and auto-exposure hunting both cause frame-wide brightness
changes, which frame differencing reads as motion. If you get bursts of clips at dawn and
dusk, that is the usual cause.

## Camera presets

`Config.CAMERA_CONFIGS` lists the presets:

```python
'full_res': {'size': (4608, 2592), 'fps': 15}     # Camera Module 3
'1080p':    {'size': (1920, 1080), 'fps': 50}     # default
'720p':     {'size': (1280,  720), 'fps': 100}
'480p':     {'size': ( 854,  480), 'fps': 120}
```

Be aware: `CameraManager.configure()` passes the preset **name** straight to
`Picamera2.configure()`, so the size/fps values in that dict are not applied — Picamera2
resolves the string against its own configuration names. If you need an exact resolution,
build a configuration explicitly, for example:

```python
cfg = self.picam2.create_video_configuration(main={"size": (1920, 1080)})
self.picam2.configure(cfg)
```

Regardless of preset, the capture loop sleeps `1/30` s, so detection runs at roughly 30 fps
and never faster.

## Uploading

`VideoHandler.stop_recording` stops the encoder and hands the file to a daemon thread, so
detection continues while the upload runs. `APIClient.upload_video` posts multipart
`file` + `roi_triggered` + `timestamp` to `/api/video/upload` and deletes the local file
after a 200.

`APIClient` re-authenticates automatically on a 401 and retries up to
`MAX_RETRY_ATTEMPTS` (3) times with a 1-second delay. If all retries fail, the local
`.h264` file stays on the Pi — check the working directory for orphaned files after an
outage.

Recordings are written to the process's working directory, named
`motion_<YYYY_MM_DDTHH_MM_SS>.h264` in **UTC**. The API's calendar grouping uses the row's
`created_at` in server time, so a UTC filename and the day it appears under can differ if
your server is not on UTC.

## Running as a service

`/etc/systemd/system/motion-detection.service`:

```ini
[Unit]
Description=Motion detection camera agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/motion-detection
ExecStart=/usr/bin/python3 /home/pi/motion-detection/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now motion-detection
journalctl -u motion-detection -f
```

`WorkingDirectory` matters: it is where `.h264` files are written before upload.

## Security

`config.py` holds the backend credentials in plain text, and the Flask server has no
authentication at all. Anyone who can reach port 8080 can watch your camera. Keep the Pi off
the public internet and let the API proxy the stream (`/api/video/stream-alt`) instead of
forwarding the port.
