# Pi deploy — v2 target state

Turns the Pi into exactly one thing: a camera that publishes RTSP. Nothing else runs here
once this is in place — no Python, no Flask, no upload logic. See
[../../docs/v2/08-pi-agent.md](../../docs/v2/08-pi-agent.md) for the full reasoning
(especially: the Pi 5 has no hardware H.264 encoder, so every setting here is chosen with
CPU budget in mind).

## Files

| File | What |
|---|---|
| `mediamtx.yml` | The one config file: 1080p25 @ 3 Mbit, 1s keyframes, `vflip` at capture |
| `mediamtx.service` | systemd unit, restarts on failure, `Nice=-5` |
| `install.sh` | Downloads the right MediaMTX binary for the Pi's arch, installs both of the above, enables (does not start) the service |

## Install

```bash
ssh rpi
cd ~/motion-detection && git pull   # or scp this folder over
./python/deploy/install.sh
```

The script stops short of starting the service — see it for the cutover checklist. **Not
run yet as of this writing**: nothing is currently running on the Pi (confirmed 2026-09-02),
so there is no live conflict to manage, but the checklist is still worth following in order
(camera access is exclusive; running two capture processes at once fails in confusing ways).

## Verifying it worked

```bash
ffplay -fflags nobuffer -flags low_delay rtsp://192.168.1.221:8554/cam
```

```bash
ffprobe -v error -show_entries stream=width,height,r_frame_rate,codec_name -of json \
  rtsp://192.168.1.221:8554/cam
```

Expect: 1920×1080, ~25 fps, `h264`, and — because of `rpiCameraVFlip: true` — the picture
right-side up despite the camera being mounted upside down.

Then, over the following 24 hours:

```bash
vcgencmd measure_temp
vcgencmd get_throttled   # anything other than 0x0 means the encoder is being starved
```

Roadmap done-criteria for this phase: [../../docs/v2/09-roadmap.md](../../docs/v2/09-roadmap.md#phase-1--the-pi-becomes-a-camera--1-evening).

## Security

The RTSP port has no authentication and is not meant to. It must not be reachable outside
the LAN — do not port-forward `8554`. The cluster dials **out** to the Pi; the Pi holds no
credentials and initiates no outbound connections, which is a real improvement over v1
(hardcoded `admin`/`admin` credentials baked into `config.py`, used to authenticate uploads).
