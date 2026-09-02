# Troubleshooting

Known bugs first, then a symptom-based checklist.

## Known issues

### Zero-byte uploads fail conversion

The Pi occasionally uploads an `.h264` file with no usable stream. ffmpeg then fails with:

```
[h264] Format h264 detected only with low score of 1, misdetection possible!
[h264] Could not find codec parameters for stream 0 (Video: h264, none): unspecified size
Output file #0 does not contain any stream
```

The row stays `processed = false`, so the clip never appears in the app, and the `.h264`
file stays in `private/UnprocessedRecordings`.

Detect it:

```bash
docker compose exec app find private/UnprocessedRecordings -size -1k -name '*.h264'
docker compose exec app grep -c "Conversion failed" var/log/video_conversion-$(date +%Y-%m-%d).log
```

Clean up the leftovers:

```bash
docker compose exec app find private/UnprocessedRecordings -size -1k -name '*.h264' -delete
docker compose exec db mysql -usymfony -psymfony symfony \
  -e "SELECT id, file_name, created_at FROM motion_detected_file WHERE processed = 0;"
```

The root cause is on the Pi side: the encoder is stopped before it has written a keyframe,
typically when a recording starts and stops within a fraction of a second. Guarding
`VideoHandler.stop_recording` with a minimum duration, or checking `os.path.getsize()`
before uploading in `APIClient.upload_video`, would prevent the empty files from being sent
at all.

### Live view memory growth

`GET /api/video/stream-alt` holds a PHP-FPM worker open for the entire life of the stream
while it relays the Pi's MJPEG frames. Every viewer occupies one process, and long sessions
grow memory until the worker is recycled.

Mitigations while it stands: keep the livestream screen open only briefly, and make sure
`LivestreamView` unmounts cleanly (it removes the `<img>` `src` on unmount, which is what
closes the connection). A durable fix means not proxying a persistent stream through
PHP-FPM — a small dedicated proxy, WebRTC/HLS, or nginx relaying the Pi directly.

### `roi_motion_threshold` is not applied

The setting is stored, exposed by the API and fetched by `SettingsManager`, but
`MotionDetector.detect_motion` compares ROI motion against `motion_threshold * 0.5`
instead. Changing `roi_motion_threshold` in the app has no effect on detection today.

### `important=false` still filters to important

Both calendar endpoints use `$request->query->has('important')`, so any value — including
`false` or `0` — selects important clips. Omit the parameter for normal clips.

### Camera presets are not applied as written

`CameraManager.configure()` passes the preset name straight to `Picamera2.configure()`, so
the `size` and `fps` values in `Config.CAMERA_CONFIGS` are never used. See
[raspberry-pi.md](raspberry-pi.md#camera-presets).

### Other open items

- No PHP test suite.
- No disk-usage or server-status screen in the app.
- API response shapes are inconsistent; see [api.md](api.md#response-conventions).
- The app does not re-lock after being minimised for a while.
- `findFilesOrderedByDateWithLimit` in `MotionDetectedFileRepository` takes `$limit` and
  `$offset` but applies neither, so cleanup loads all files of a type per batch. It works,
  but memory use scales with the number of rows.

## Nothing appears in the app

Walk the pipeline in order; each step has a visible artefact.

**1. Is the Pi detecting?** Watch its output — you want `Starting new recording` and
`Stopping recording` lines. If not, check `/debug_view` on the Pi and lower
`motion_threshold`.

**2. Is the Pi authenticating?** `Authentication failed` at startup means `BASE_URL` or
`AUTH_CREDENTIALS` in `config.py` is wrong, or the API is unreachable from the Pi.

**3. Is the upload arriving?**

```bash
docker compose exec app ls -la private/UnprocessedRecordings
```

Files here mean uploads work but conversion does not. Nothing here, with the Pi reporting
`Successfully uploaded`, points at a path or permissions mismatch.

**4. Is the worker running?**

```bash
docker compose ps symfony_worker
docker compose logs --tail=50 symfony_worker
docker compose exec db mysql -usymfony -psymfony symfony \
  -e "SELECT COUNT(*) FROM messenger_messages;"
```

A growing `messenger_messages` table means jobs are queued but nothing consumes them. The
worker sleeps 300 seconds between runs, so a clip can take up to five minutes to appear.
To process immediately:

```bash
docker compose exec app php bin/console messenger:consume async --limit=10 -vv
```

**5. Did conversion succeed?**

```bash
docker compose exec app tail -50 var/log/video_conversion-$(date +%Y-%m-%d).log
docker compose exec app ls -la public/recordings
```

**6. Is the row processed?** Only `processed = true` rows show in the calendar:

```bash
docker compose exec db mysql -usymfony -psymfony symfony \
  -e "SELECT id, file_name, type, processed, created_at FROM motion_detected_file ORDER BY id DESC LIMIT 10;"
```

**7. Are you looking at the right filter?** Clips triggered inside the ROI land under
**Important**, not **Normal**. The two tabs are separate lists.

## Upload fails with 413

The clip is larger than the configured limits. Raise all three together —
`client_max_body_size` in `docker/nginx/conf.d/symfony.conf`, and `upload_max_filesize` plus
`post_max_size` in `docker/php/php.ini` — then restart nginx and PHP. Or lower
`max_recording_duration` or the camera resolution.

## Live view stays blank

1. Can the API reach the Pi? `docker compose exec app curl -I $RASPBERRY_BASE_URL/single_frame`
2. Is `RASPBERRY_BASE_URL` still correct? A DHCP lease change is the usual culprit — give
   the Pi a static address.
3. Is the agent running and is port 8080 open on the Pi?
4. Mixed content: an HTTPS app cannot load an HTTP stream. The API must be on HTTPS.

## The region editor shows no image

`POST /api/user/settings/{id}/placeholder-image` returns 404 when the API cannot fetch
`/single_frame` from the Pi. Same checks as above. The stored path ends up in
`settings.placeholder_image_url`, and the app prefixes it with `VITE_API_BASE_URL`, so that
variable must point at the API host serving `public/`.

## Logged out constantly

- Access tokens last 1 hour; the app refreshes automatically. If refresh fails, check that
  `/api/token/refresh` is reachable and that `CORS_ALLOW_ORIGIN` covers the app's origin.
- Logging in elsewhere deletes other refresh tokens for that username — two devices sharing
  one account will keep evicting each other.
- The auth cookie is `Secure` + `SameSite=None` and is silently dropped over plain HTTP.
- A cold app start always requires biometric unlock; that is by design.

## 404 on `/api/user/initialize`

The user has no `Settings` row. `app:user:create` creates only the `User`. Add a settings
row for that user, or log in as the fixture user.

## Disk fills up anyway

- Cleanup only runs when a new upload comes in. A camera that sees no motion never prunes.
- The budget is **per type**: normal and important each get `MAX_DISK_SIZE_USAGE_GB`.
- Failed conversions leave `.h264` files in `private/UnprocessedRecordings` that no cleanup
  path touches. Sweep them periodically.

```bash
docker compose exec app du -sh public/recordings private/UnprocessedRecordings
```

## Videos play upside down

`ProcessFileMessageHandler` applies an ffmpeg `vflip` because the camera is mounted upside
down. The default is `flip_vertical = true` in its constructor. If your camera is the right
way up, bind that argument to `false` in `config/services.yaml`; already-converted files
keep the flip they were made with.

Note that the live view is flipped separately, in CSS (`img { scale: -1; }` in
`LivestreamView.vue`), so the two paths can disagree if you change one and not the other.
