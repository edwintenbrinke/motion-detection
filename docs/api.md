# API reference

Base URL: your API host (`http://localhost:7100` in the Compose stack). Interactive
documentation generated from the PHP attributes lives at **`/api/doc`**, with the raw
OpenAPI document at `/api/doc.json`.

Every route under `/api` requires authentication except `/api/login`,
`/api/token/refresh`, `/api/logout` and `/api/doc`.

## Authentication

Send the access token either as a header (what the Pi and the mobile app do):

```
Authorization: Bearer <jwt>
```

or rely on the `auth_token` HTTP-only cookie that `/api/login` sets (convenient in a
browser). `JwtCookieOrHeaderAuthenticator` checks the header first and falls back to the
cookie.

Access tokens are valid for **1 hour**, refresh tokens for **30 days**.

### POST /api/login

```json
{ "username": "admin", "password": "admin" }
```

**200**

```json
{ "token": "eyJ0eXAiOiJKV1Qi...", "refresh_token": "8f3c1e..." }
```

Also sets `auth_token` (HTTP-only, `Secure`, `SameSite=None`, 1 hour). Logging in deletes
every other refresh token for that username, so a new login ends older sessions.

**401** — `{"code": 401, "message": "Invalid credentials."}`

### POST /api/token/refresh

```json
{ "refresh_token": "8f3c1e..." }
```

**200** — a new `{token, refresh_token}` pair.
**401** — `{"message": "Invalid or expired refresh token"}`; the client must log in again.

### POST /api/logout

Clears the `auth_token` and `username` cookies. Returns
`{"message": "Logged out successfully"}`. It does not revoke the JWT itself — tokens stay
valid until they expire.

## Videos

### POST /api/video/upload

Used by the Pi. `multipart/form-data`:

| Field           | Type   | Notes                                                     |
|-----------------|--------|-----------------------------------------------------------|
| `file`          | binary | The raw `.h264` recording                                 |
| `roi_triggered` | string | Compared against the literal `"True"` (Python's `str(True)`) |
| `timestamp`     | string | Sent by the Pi, not currently read by the controller       |

The controller checks `$request->get('roi_triggered') === 'True'` — capital T, string
comparison. A JSON boolean or `"true"` in lower case is read as *not* ROI-triggered, and
the clip is filed as **normal**.

The file is moved to `PRIVATE_UNPROCESSED_RECORDINGS_FOLDER` (with a `-1`, `-2` … suffix on
name collisions), a `MotionDetectedFile` row is created with `processed = false`, and both
`ProcessFileMessage` and `FileCleanupMessage` are dispatched to the async transport.

**200** `{"message": "Motion successfully uploaded"}`
**400** `{"message": "No file uploaded"}`
**500** `{"message": "File move failed"}`

Uploads are capped by nginx (`client_max_body_size 50M`) and PHP
(`upload_max_filesize` / `post_max_size`, both 50M).

### GET /api/video/stream/{filename}

Streams a converted MP4. Looks the record up by `file_name`, so pass the name exactly as
the calendar endpoint returned it.

Supports HTTP `Range` requests (`Accept-Ranges: bytes`, `206 Partial Content`, 8 KB chunks),
which is what makes seeking work in the player. Without a `Range` header the whole file is
sent. `Content-Disposition: inline`, so browsers play rather than download it.

**404** — `File not found` (plain text) when the row or the file on disk is missing.

### GET /api/video/stream-alt

Proxies the Pi's MJPEG live view. Opens `RASPBERRY_BASE_URL/video_feed` unbuffered and
relays the chunks as `multipart/x-mixed-replace; boundary=frame` with caching disabled.

The response never ends on its own — the client closes it by dropping the `<img>` source.
See [troubleshooting.md](troubleshooting.md#live-view-memory-growth).

### GET /api/video/debug/{filename}

Debug helper. Reports on a file in `public/recordings` without touching the database:

```json
{ "path": "...", "exists": true, "readable": true, "size": 1048576, "mime_type": "video/mp4" }
```

## Motion detected files

### GET /api/motion-detected-file/calendar/{date}

Hourly clip counts for one day. `date` is anything `DateTime` accepts, e.g. `2025-02-11`.

| Query param | Effect                                                                        |
|-------------|-------------------------------------------------------------------------------|
| `since`     | Start of the window instead of 00:00. Ignored if it falls on a different day    |
| `important` | **Presence-only.** Any value — including `important=false` — selects important |

Only rows with `processed = true` are counted.

**200**

```json
[ { "hour": 7, "count": 3 }, { "hour": 14, "count": 12 } ]
```

The `since` parameter is what makes polling cheap: the app remembers when it last fetched a
day and asks only for what came after.

### GET /api/motion-detected-file/calendar/{date}/{hour}

The clips inside one hour, newest first. `hour` is 0–23. `important` behaves as above.

**200**

```json
[
  {
    "file_name": "motion_2025_02_11T23_03_08.mp4",
    "video_duration": 12,
    "type": 1,
    "created_at": "2025-02-11T23:03:08+00:00"
  }
]
```

`type` is the `MotionDetectedFileTypeEnum` value: `0` = normal, `1` = important. Feed
`file_name` to `/api/video/stream/{filename}` to play the clip.

### POST /api/motion-detected-file/

Creates a record from metadata only, without an upload. Body matches
`MotionDetectedFileInputDTO` (`file_name`, `file_path`, `type`) and the size is stored as 0.
Mainly useful for seeding and testing; the real ingest path is `/api/video/upload`.

## User and settings

### GET /api/user/initialize

Everything the app needs at boot, in one call:

```json
{
  "user":     { "id": 1, "username": "admin", "created_at": "2025-01-01T00:00:00+00:00" },
  "settings": {
    "id": 1,
    "motion_threshold": 5000,
    "roi_motion_threshold": 500,
    "recording_extension": 5,
    "max_recording_duration": 60,
    "max_disk_usage_in_gb": 100,
    "detection_area_points": [ { "x": 0.1, "y": 0.2 }, { "x": 0.8, "y": 0.2 } ],
    "placeholder_image_url": "/images/placeholder_1.jpeg"
  }
}
```

**404** if the authenticated user has no `Settings` row — the usual cause after creating a
user with `app:user:create`.

### GET /api/user/settings

The `settings` half of the payload above. This is the endpoint the Pi polls every minute.

### PATCH /api/user/settings/{id}

Updates the numeric settings. All five fields are required:

```json
{
  "motion_threshold": 5000,
  "roi_motion_threshold": 500,
  "recording_extension": 5,
  "max_recording_duration": 60,
  "max_disk_usage_in_gb": 100
}
```

**200** `{"message": "Settings updated."}`
**403** when the settings row belongs to another user.
**400** with validation errors otherwise.

### PATCH /api/user/settings/{id}/image-region

Replaces the ROI polygon with normalized coordinates:

```json
{ "detection_area_points": [ {"x": 0.1, "y": 0.2}, {"x": 0.8, "y": 0.2}, {"x": 0.8, "y": 0.9} ] }
```

The Pi picks the new polygon up within 60 seconds and rebuilds its mask.

### POST /api/user/settings/{id}/placeholder-image

Asks the API to fetch a frame from the Pi (`GET RASPBERRY_BASE_URL/single_frame`), save it
as `public/images/placeholder_{id}.jpeg`, and store the path on the settings row. The app
uses that image as the background for the region editor.

**404** when the Pi is unreachable or does not return 200.

## Response conventions

Worth knowing before you build against this API — the shapes are not fully consistent yet
(it is on the TODO list in the project README):

- Most errors are JSON with a `message` key, but `/api/video/stream/{filename}` and
  `/api/video/debug/{filename}` return plain-text bodies.
- `POST /api/motion-detected-file/` documents 201 in its OpenAPI attribute but returns 200.
- `important` is checked with `has()`, not by value, so `?important=0` still filters to
  important clips. Omit the parameter entirely for normal clips.
