# Setup

Three things to install: the backend stack, the frontend, and the Raspberry Pi agent. The
backend can run on any machine with Docker; the Pi agent must run on the Pi itself.

## Requirements

| Where    | Needs                                                                   |
|----------|-------------------------------------------------------------------------|
| Server   | Docker + Docker Compose. Without Docker: PHP 8.4, MySQL 8.4, ffmpeg, nginx |
| Pi       | Raspberry Pi OS (Bookworm), a CSI or USB camera, Python 3.13+            |
| Dev box  | Node.js 24 for the frontend, Android Studio + JDK 17 for the app build   |

## 1. Backend

```bash
git clone <your remote> motion-detection
cd motion-detection
docker compose up -d --build
```

Containers and ports:

| Container        | Port  | What                                       |
|------------------|-------|--------------------------------------------|
| `symfony_nginx`  | 7100  | The API and Swagger UI                      |
| `symfony_app`    | —     | PHP-FPM                                     |
| `symfony_worker` | —     | `messenger:consume async` in a restart loop |
| `symfony_db`     | 7001  | MySQL 8.4                                   |
| `symfony_redis`  | 7002  | Redis                                       |
| `vue_frontend`   | 7003  | Vite 7 dev server                           |
| `python_script`  | —     | Optional (`--profile raspberry`); needs a camera |

The app container installs Composer packages, waits for MySQL, runs migrations, generates
JWT keys if missing, and loads fixtures on first start (`admin` / `admin`). To wipe and
reload the database later:

```bash
docker compose exec app ./fixtures.sh
```

`fixtures.sh` **drops and recreates the database**, runs the migrations, loads fixtures and
sets up the Messenger transport tables. Use it for a fresh install only. On an existing
install run migrations instead:

```bash
docker compose exec app php bin/console doctrine:migrations:migrate
```

Generate the JWT keypair if `api/config/jwt/` is empty:

```bash
docker compose exec app php bin/console lexik:jwt:generate-keypair
```

The passphrase must match `JWT_PASSPHRASE` in your env file.

Create the directories the upload pipeline writes to, if they are not there yet:

```bash
docker compose exec app mkdir -p private/UnprocessedRecordings public/recordings public/images
```

Point your environment at your own values by creating `api/.env.local` — never edit `.env`
for secrets. See [configuration.md](configuration.md) for the full list. The minimum:

```dotenv
APP_ENV=prod
APP_SECRET=<random 32 hex chars>
DATABASE_URL="mysql://symfony:symfony@db:3306/symfony?serverVersion=8.4.0&charset=utf8mb4"
JWT_PASSPHRASE=<your passphrase>
RASPBERRY_BASE_URL='http://192.168.1.221:8080'
MAX_DISK_SIZE_USAGE_GB=100
CORS_ALLOW_ORIGIN='^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$'
```

### Users

The fixtures create `admin` / `admin` with a settings row. Create a real user with:

```bash
docker compose exec app php bin/console app:user:create
```

`app:user:create` only creates the `User`. A user without a `Settings` row makes
`/api/user/initialize` and `/api/user/settings` return 404, so add one (via a fixture, a
small script or SQL) for any new user.

### The `python_script` container

The Compose stack builds `python/` into a container. It has no camera, so it cannot run the
agent — it exists for testing the non-camera code paths and for the shared `recordings`
volume. On the Pi you run the agent directly, not in Docker.

## 2. Frontend

The Compose stack runs the Vite 7 dev server on http://localhost:7003, pointed at
http://localhost:7100. To run it on your own machine instead:

```bash
cd web
npm install
npm run dev
```

Configure the API base URL in `web/.env.local`:

```dotenv
VITE_API_BASE_URL=https://api.example.com
VITE_TEST_BUTTON=false
```

Use `http://10.0.2.2` when running against a backend on your host from the Android
emulator. A production build lands in `web/dist`:

```bash
npm run build
```

For the Android app, see [mobile-app.md](mobile-app.md).

## 3. Raspberry Pi agent

On the Pi:

```bash
sudo apt update
sudo apt install -y python3-picamera2 python3-opencv python3-flask python3-requests python3-numpy
```

`picamera2` comes from apt on Raspberry Pi OS — do not install it with pip. Copy the agent
across and edit its config:

```bash
scp -r python/ pi@raspberrypi.local:~/motion-detection
```

Edit `python/config.py` on the Pi:

```python
BASE_URL = "https://api.example.com"     # your backend
AUTH_CREDENTIALS = {                      # a real user, not the fixture
    "username": "pi",
    "password": "<password>",
}
```

Run it:

```bash
cd ~/motion-detection
python3 main.py
```

You should see the login succeed, then `Starting server on port 8080`. Check
`http://<pi>:8080/` for the live view and `http://<pi>:8080/debug_view` for the ROI overlay.

For autostart with systemd, see [raspberry-pi.md](raspberry-pi.md#running-as-a-service).

## 4. Wire the pieces together

1. In `api/.env.local`, set `RASPBERRY_BASE_URL` to the Pi's LAN address and port 8080.
2. In `python/config.py`, set `BASE_URL` to the API's public address.
3. In `web/.env.local`, set `VITE_API_BASE_URL` to the same API address.
4. Log in to the app, open **Settings → Region**, and draw the detection polygon. The app
   first asks the API to fetch a fresh frame from the Pi as the background image, so the Pi
   must be reachable from the API for this screen to work.
5. Walk in front of the camera. Within a minute the clip should appear in the calendar.

## Verifying the pipeline

```bash
# Is the Pi authenticating and uploading?
journalctl -u motion-detection -f          # or watch the console output

# Did the API receive it?
docker compose exec app ls -la private/UnprocessedRecordings

# Did the worker convert it?
docker compose exec app tail -f var/log/video_conversion-$(date +%Y-%m-%d).log
docker compose exec app ls -la public/recordings

# Is it in the database and processed?
docker compose exec db mysql -usymfony -psymfony symfony \
  -e "SELECT id, file_name, type, processed, created_at FROM motion_detected_file ORDER BY id DESC LIMIT 5;"
```

## Production notes

- Run the API behind HTTPS. The auth cookie is `Secure` + `SameSite=None`, so it is simply
  dropped over plain HTTP.
- Set `APP_ENV=prod` and run `composer install --no-dev --optimize-autoloader` plus
  `php bin/console cache:clear`.
- Set `CORS_ALLOW_ORIGIN` to your real frontend origin instead of the localhost regex.
- nginx caps uploads at `client_max_body_size 50M` and PHP at `upload_max_filesize=50M`.
  A 60-second 1080p clip can exceed that; raise both together if you increase
  `max_recording_duration`.
- Make sure the `symfony_worker` container (or the crontab entry) is actually running — no
  worker means uploads pile up unconverted and nothing appears in the app.
