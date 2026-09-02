# Architecture

The system has three deployable parts that only talk over HTTP:

1. **The Pi agent** (`python/`) — sees the world, decides what is worth recording.
2. **The API** (`api/`) — stores, transcodes, catalogues and prunes; the only component
   that holds state.
3. **The app** (`web/`) — browses recordings and changes settings; runs in a browser or as
   an Android app.

The Pi never talks to the database and the app never talks to the Pi. Everything goes
through the API, which means only the API needs to be reachable from the internet.

## Components

### Raspberry Pi agent (`python/`)

| File                  | Responsibility                                                          |
|-----------------------|-------------------------------------------------------------------------|
| `main.py`             | Wires everything together and starts the Flask server                   |
| `camera_manager.py`   | Owns `Picamera2`, runs the ~30 fps capture thread, keeps a 2-frame queue |
| `motion_detector.py`  | Frame differencing, ROI masking, start/stop/extend recording decisions   |
| `video_handler.py`    | Starts/stops the H.264 encoder, uploads finished files in a thread       |
| `api_client.py`       | JWT login, retry logic, upload, settings fetch                           |
| `settings_manager.py` | Polls the API every 60 s, thread-safe settings, notifies on ROI change   |
| `web_server.py`       | Flask endpoints: MJPEG stream, single frame, ROI debug view              |
| `config.py`           | Backend URL, credentials, camera presets, server host/port               |

`raspberry_stream_and_post.py` is the original single-file prototype. It is kept for
reference and is not used by `main.py`.

Threads inside the agent:

- **Capture thread** (`CameraManager._continuous_capture`) — captures a frame, JPEG-encodes
  it, pushes it on the queue and hands it to the motion detector. Sleeps `1/30` s per loop.
- **Settings thread** (`SettingsManager._update_loop`) — refetches settings every
  `SETTINGS_UPDATE_INTERVAL` seconds and resets the ROI mask when the polygon changed.
- **Upload threads** — one short-lived thread per finished recording.
- **Flask** — serves the live view, threaded.

### API (`api/`)

Symfony 7.4 LTS on PHP 8.4, behind nginx, with MySQL 8.4 for data and Doctrine Messenger (Doctrine
transport) for background jobs. Redis is in the Compose stack but is currently only
available, not required by the code paths above.

| Layer                            | Classes                                                      |
|----------------------------------|--------------------------------------------------------------|
| HTTP                             | `VideoController`, `MotionDetectedFileController`, `UserController`, `AuthenticationController` |
| Security                         | `JwtCookieOrHeaderAuthenticator`, `JwtCookieAuthenticationSuccessHandler`, `RefreshTokenAuthenticator` |
| Domain                           | `MotionDetectedFile`, `Settings`, `User`, `RefreshToken`      |
| Background jobs                  | `ProcessFileMessageHandler` (ffmpeg), `FileCleanupMessageHandler` (retention) |
| Support                          | `FileHandler`, `RaspberryApiService`, `PaginationService`, `RequestResponseLogger` |

Two containers run the same image: `symfony_app` serves requests through PHP-FPM, and
`symfony_worker` runs `messenger:consume async` in a restart loop
(`--time-limit=300 --memory-limit=200M`). `api/symfony.crontab` is the equivalent for a
non-Docker host.

### App (`web/`)

Vue 3 + Vite, PrimeVue for components, Pinia (persisted to local storage) for state, and
Capacitor to package the same code as an Android app.

| Store            | Holds                                                                |
|------------------|----------------------------------------------------------------------|
| `authentication` | JWT lifecycle, biometric verification flag, app-active flag           |
| `initialize`     | The `/api/user/initialize` payload: user + settings                   |
| `video`          | Cached day/hour listings, filter state, cache-freshness rules         |
| `loading`        | Global spinner, driven by the axios interceptors                      |

Views map onto the routes in `src/router/index.js`: login, calendar, calendar day,
livestream, settings and the ROI region editor.

## The life of a recording

```
1. capture      Pi grabs a frame, JPEG-encodes it, hands it to the detector
2. detect       absdiff vs previous frame → threshold → count changed pixels
                   full-frame score  > motion_threshold          → record
                   ROI-masked score  > roi_motion_threshold*0.5  → mark important
3. record       H264Encoder writes motion_<UTC timestamp>.h264 on the Pi
                   more motion  → stop time pushed to now + recording_extension
                   ceiling      → recording_start + max_recording_duration
4. upload       POST /api/video/upload (multipart: file + roi_triggered)
                   local file deleted after a 200
5. store        file moved to private/UnprocessedRecordings, row inserted with
                type = important when roi_triggered else normal, processed = false
6. dispatch     ProcessFileMessage + FileCleanupMessage onto the async transport
7. convert      worker runs ffmpeg (libx264/aac, vertical flip) into
                public/recordings/<name>.mp4, deletes the .h264, reads
                duration/width/height with ffprobe, sets processed = true
8. prune        per type, if SUM(file_size) > max_disk_usage_in_gb, delete oldest
                files from disk and database until under budget
9. browse       app asks /api/motion-detected-file/calendar/<date> for hourly counts,
                then /calendar/<date>/<hour> for the clips in an hour
10. play        <video> plays /api/video/stream/<filename>, which honours Range
                requests so seeking works
```

Note that only `processed = true` rows appear in the calendar endpoints, so a clip shows up
in the app a few seconds after the upload — as soon as the worker has transcoded it.

## Settings flow

Settings live in one `Settings` row per user, and travel in a loop:

```
app  ──PATCH /api/user/settings/{id}────────────►  MySQL
app  ──PATCH /api/user/settings/{id}/image-region►  MySQL   (ROI polygon)
Pi   ──GET   /api/user/settings ─────────────────►  MySQL   (every 60 s)
```

The ROI polygon is stored as normalized coordinates (`{"x": 0.0-1.0, "y": 0.0-1.0}`), so the
same polygon works regardless of the resolution the camera runs at. The Pi converts them to
pixels and builds a binary mask with `cv2.fillPoly`.

To let you draw that polygon over a real image, the app can ask the API to grab a frame:
`POST /api/user/settings/{id}/placeholder-image` makes the API call the Pi's `/single_frame`
and store the JPEG as `public/images/placeholder_<settings id>.jpeg`.

## Live view

The Pi serves MJPEG on `http://<pi>:8080/video_feed`. The app does not connect to it
directly — it points an `<img>` at `GET /api/video/stream-alt`, and the API streams the Pi's
frames through with `HttpClientInterface` and `buffer => false`. The Pi therefore stays on
the LAN, and only the API needs a public address.

The cost is that a viewer holds one long-lived PHP request open for as long as the stream
runs. See [troubleshooting.md](troubleshooting.md#live-view-memory-growth).

## Authentication

- `POST /api/login` (json_login firewall) returns `{token, refresh_token}` and also sets an
  HTTP-only `auth_token` cookie (`Secure`, `SameSite=None`, 1 hour).
- `JwtCookieOrHeaderAuthenticator` accepts either the `Authorization: Bearer` header (used
  by the Pi and the mobile app) or that cookie (convenient in a browser).
- Access tokens live 1 hour (`token_ttl`), refresh tokens 30 days
  (`gesdinet_jwt_refresh_token.ttl`). On login every other refresh token for that username
  is deleted, so one login invalidates older sessions.
- The app's axios response interceptor catches a 401, refreshes once, queues concurrent
  requests behind that refresh, and logs out when the refresh token itself is rejected.
- The Android app adds a biometric gate on top: a valid token is not enough, the session
  also needs `biometricVerified` and `isAppActive`. See [mobile-app.md](mobile-app.md).
