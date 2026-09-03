# Pi deploy — v2 target state

Turns the Pi into exactly one thing: a camera that publishes RTSP. Nothing else runs here
once this is in place — no Python, no Flask, no upload logic. See
[../../docs/v2/08-pi-agent.md](../../docs/v2/08-pi-agent.md) for the full reasoning
(especially: the Pi 5 has no hardware H.264 encoder, so every setting here is chosen with
CPU budget in mind).

**Status: installed and running since 2026-09-03.** 1080p25 at 3.00 Mbit, keyframe every
second, upright. One thing is still open — the Pi has no active cooler and is thermally
throttled. See [Heat](#heat) below.

## Files

| File | What |
|---|---|
| `mediamtx.yml` | The one config file: 1080p25 @ 3 Mbit, 1s keyframes, `vflip` at capture, RTSP-over-TCP only |
| `mediamtx.service` | systemd unit, restarts on failure, `Nice=-5` |
| `install.sh` | Downloads MediaMTX pinned by version **and** sha256, installs both of the above, enables (does not start) the service |
| `soak/` | Phase 1 verification only: a timer that logs Pi health every 5 minutes. Not part of the camera |

## Install

```bash
scp -r python/deploy rpi:~/mediamtx-deploy
```

```bash
ssh rpi '~/mediamtx-deploy/install.sh'
```

The script stops short of starting the service: camera access is exclusive, so a second
capture process is a confusing failure rather than a loud one. Re-running it later to
upgrade is safe — it stops a running MediaMTX, replaces the binary, and starts it again.

## Verifying it worked

MediaMTX is configured for **RTSP over TCP only**, and ffmpeg defaults to UDP, so the
transport has to be named explicitly or the connection just hangs:

```bash
ffplay -rtsp_transport tcp -fflags nobuffer -flags low_delay rtsp://192.168.1.221:8554/cam
```

```bash
ffprobe -v error -rtsp_transport tcp -show_entries stream=width,height,r_frame_rate,codec_name -of json rtsp://192.168.1.221:8554/cam
```

Expect: 1920×1080, 25 fps, `h264`, and — because of `rpiCameraVFlip: true` — the picture
right-side up despite the camera being mounted upside down.

From the Pi itself, no video player required (the API is loopback-only):

```bash
ssh rpi 'curl -s localhost:9997/v3/paths/get/cam'
```

And the running record, once `soak/install.sh` has been run:

```bash
ssh rpi 'tail -20 /var/log/mediamtx-soak.log'
```

Roadmap done-criteria for this phase: [../../docs/v2/09-roadmap.md](../../docs/v2/09-roadmap.md#phase-1--the-pi-becomes-a-camera--1-evening).

## Heat

`vcgencmd get_throttled` currently reads `0xe0006`, not the `0x0` the roadmap asks for: the
soft temperature limit is reached and the ARM clock is capped. The die runs 83–86 °C while
streaming and idles at 63.7 °C, because **no active cooler is fitted** — there is no fan in
`/sys/class/hwmon/` and no cooling device in `/sys/class/thermal/`.

It is not dropping frames today; 25.00 fps and 3.00 Mbit were measured with the throttle
bits already set, because the encoder only needs about two thirds of one core. What is gone
is the margin. Fit the cooler.

## Security

The RTSP port has no authentication and is not meant to. It must not be reachable outside
the LAN — do not port-forward `8554`. The cluster dials **out** to the Pi; the Pi holds no
credentials and initiates no outbound connections, which is a real improvement over v1
(hardcoded `admin`/`admin` credentials baked into `config.py`, used to authenticate uploads).

The config deliberately turns off every protocol MediaMTX ships with except RTSP, including
Media-over-QUIC, which is **on by default since 1.20** and otherwise listens on 8892/8893 on
every interface. After that the box listens on exactly two sockets:

```
tcp  *:8554          RTSP
tcp  127.0.0.1:9997  control API, loopback only
```

Worth re-checking after any MediaMTX upgrade — the surface grows as the project adds
protocols:

```bash
ssh rpi 'sudo ss -tulpn | grep mediamtx'
```
