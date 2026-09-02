# Configuration

Configuration lives in three places: environment files for the API and frontend, a Python
module on the Pi, and a database row for the runtime settings you change from the app.

## API environment variables

Defaults live in `api/.env` (committed). Override them in `api/.env.local` (never
committed) — that is where secrets belong.

| Variable                                | Example                                                        | What it does |
|-----------------------------------------|----------------------------------------------------------------|--------------|
| `APP_ENV`                               | `dev` / `prod`                                                 | Symfony environment |
| `APP_SECRET`                            | 32 random hex chars                                            | Symfony secret |
| `DATABASE_URL`                          | `mysql://symfony:symfony@symfony_db:3306/symfony?serverVersion=8.0&charset=utf8mb4` | Doctrine connection |
| `CORS_ALLOW_ORIGIN`                     | `^https://app\.example\.com$`                                  | Regex of allowed origins; credentials are allowed, so keep it tight |
| `PUBLIC_RECORDINGS_FOLDER`              | `%kernel.project_dir%/public/recordings`                       | Where converted MP4s are served from |
| `PUBLIC_FOLDER`                         | `%kernel.project_dir%/public`                                  | Used for the ROI placeholder image |
| `PRIVATE_UNPROCESSED_RECORDINGS_FOLDER` | `%kernel.project_dir%/private/UnprocessedRecordings`           | Where uploads land before conversion |
| `MESSENGER_TRANSPORT_DSN`               | `doctrine://default?auto_setup=0`                              | Async transport for the worker |
| `MAX_DISK_SIZE_USAGE_GB`                | `100`                                                          | Fallback budget passed into the cleanup message |
| `JWT_SECRET_KEY` / `JWT_PUBLIC_KEY`     | `%kernel.project_dir%/config/jwt/private.pem`                  | Lexik keypair paths |
| `JWT_PASSPHRASE`                        | your passphrase                                                | Must match the key |
| `RASPBERRY_BASE_URL`                    | `http://192.168.1.221:8080`                                    | Where the API reaches the Pi for the live view and single frames |

`RASPBERRY_BASE_URL` is a fixed LAN address, so give the Pi a DHCP reservation or a static
IP — otherwise the live view and the region editor break the next time your router reshuffles
addresses.

Token lifetimes are not env vars:

| Setting                        | File                                             | Value  |
|--------------------------------|--------------------------------------------------|--------|
| Access token TTL               | `config/packages/lexik_jwt_authentication.yaml`  | 3600 s |
| Refresh token TTL              | `config/packages/gesdinet_jwt_refresh_token.yaml`| 30 days |
| Auth cookie lifetime           | `JwtCookieAuthenticationSuccessHandler`          | 1 hour |

## PHP and nginx limits

| Setting               | File                             | Value |
|-----------------------|----------------------------------|-------|
| `upload_max_filesize` | `docker/php/php.ini`             | 50M   |
| `post_max_size`       | `docker/php/php.ini`             | 50M   |
| `memory_limit`        | `docker/php/php.ini`             | 128M  |
| `max_execution_time`  | `docker/php/php.ini`             | 300   |
| `client_max_body_size`| `docker/nginx/conf.d/symfony.conf` | 50M |
| `date.timezone`       | `docker/php/php.ini`             | `Europe/Amsterdam` |

Raise the three size limits together if you increase `max_recording_duration` or the camera
resolution; a clip larger than any one of them is rejected.

The timezone matters for the calendar: the Pi names files in UTC, while grouping per day and
hour uses `created_at` in the PHP timezone.

## Frontend environment variables

`web/.env` holds defaults, `web/.env.local` your overrides. Vite only exposes variables
prefixed with `VITE_`, and they are baked in at build time — rebuild after changing them.

| Variable            | Example                        | What it does |
|---------------------|--------------------------------|--------------|
| `VITE_API_BASE_URL` | `https://api.example.com`      | API base for axios, video URLs and the placeholder image |
| `VITE_TEST_BUTTON`  | `false`                        | Shows the test/debug button in the UI |

Use `http://10.0.2.2` to reach a backend on your host machine from the Android emulator.

## Pi agent configuration (`python/config.py`)

| Constant                   | Default                        | What it does |
|----------------------------|--------------------------------|--------------|
| `BASE_URL`                 | `https://api.edwintenbrinke.nl`| Backend base URL |
| `LOGIN_ENDPOINT`           | `/api/login`                   | |
| `UPLOAD_ENDPOINT`          | `/api/video/upload`            | |
| `SETTINGS_ENDPOINT`        | `/api/user/settings`           | |
| `AUTH_CREDENTIALS`         | `admin` / `admin`              | Plain-text credentials — change them |
| `MAX_RETRY_ATTEMPTS`       | 3                              | Retries per API request |
| `RETRY_DELAY`              | 1                              | Seconds between retries |
| `SETTINGS_UPDATE_INTERVAL` | 60                             | Seconds between settings polls |
| `CAMERA_CONFIGS`           | see below                      | Named presets |
| `DEFAULT_CONFIG`           | `1080p`                        | Preset applied at startup |
| `SERVER_HOST` / `SERVER_PORT` | `0.0.0.0` / `8080`          | Flask bind address |

```python
CAMERA_CONFIGS = {
    'full_res': {'size': (4608, 2592), 'fps': 15},
    '1080p':    {'size': (1920, 1080), 'fps': 50},
    '720p':     {'size': (1280,  720), 'fps': 100},
    '480p':     {'size': ( 854,  480), 'fps': 120},
}
```

See [raspberry-pi.md](raspberry-pi.md#camera-presets) for the caveat about how these presets
are actually applied.

`config.py` is committed, so credentials in it end up in git history. Keep the Pi's user
distinct from your app login, and consider moving these to environment variables.

## Runtime settings (database)

One `Settings` row per user, edited from the app's Settings screen and polled by the Pi.
Fixture defaults in brackets.

| Field                    | [default] | Used by | Meaning |
|--------------------------|-----------|---------|---------|
| `motion_threshold`       | [5000]    | Pi      | Changed pixels needed to start recording |
| `roi_motion_threshold`   | [500]     | Pi      | Intended ROI sensitivity; not currently read by the detector |
| `recording_extension`    | [5]       | Pi      | Seconds of quiet before a recording stops |
| `max_recording_duration` | [60]      | Pi      | Hard cap per clip, in seconds |
| `max_disk_usage_in_gb`   | [100]     | API     | Storage budget **per type** (normal and important each get this) |
| `detection_area_points`  | [`[]`]    | Pi      | ROI polygon, normalized 0–1 coordinates |
| `placeholder_image_url`  | `null`    | App     | Path of the last frame grabbed for the region editor |

`max_disk_usage_in_gb` is applied per category, so a value of 100 can use up to 200 GB in
total. Cleanup runs on every upload and deletes the oldest files of that type until the
category is back under budget.

Note that the API endpoint for uploads takes its budget from the injected
`MAX_DISK_SIZE_USAGE_GB` environment variable rather than from the user's settings row, so
that env var is what actually governs pruning today.

## Logs

| Log                                   | Contents |
|---------------------------------------|----------|
| `api/var/log/dev-<date>.log`          | Symfony application log (7-day rotation) |
| `api/var/log/video_conversion-<date>.log` | ffmpeg commands, successes and failures |
| `api/var/log/request_response-<date>.log` | Request/response logging from `RequestResponseLogger` |
| `docker compose logs python_script`   | Python container output (capped at 3 × 10 MB) |
| `journalctl -u motion-detection`      | The Pi agent, when run as a systemd service |
