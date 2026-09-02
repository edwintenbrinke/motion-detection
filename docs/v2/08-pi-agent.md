# The Pi, afterwards

The Raspberry Pi 5 stops being an NVR and becomes a camera. Roughly 700 lines of Python are
replaced by one config file and one systemd unit.

## Hardware

| | |
|---|---|
| Board | Raspberry Pi 5 Model B, 8 GB, `192.168.1.221`, reachable as `ssh rpi` |
| OS | Debian 12 bookworm, aarch64 |
| Sensor | `imx708_wide_noir` — Camera Module 3 Wide NoIR, 4608×2592 |
| Modes | 1536×864 @ 120 fps · 2304×1296 @ 56 fps · 4608×2592 @ 14 fps |
| Encoder | **None.** BCM2712 has no hardware H.264 encoder — encoding is CPU |
| Cooling | Active cooler required for sustained encoding |

Mounted upside down: the API currently corrects this with an ffmpeg vertical flip on every
recording. Fix it at capture with `vflip` and delete an entire transcode pass.

## What runs: MediaMTX

One binary, one config, one unit. It opens the camera through libcamera, encodes H.264 in
software, and serves RTSP. It also speaks WebRTC and HLS, which is handy for debugging
straight from a laptop without involving the cluster.

```yaml
# /etc/mediamtx.yml
logLevel: info

rtspAddress: :8554
rtmp: no
hls: no                       # flip to yes temporarily when debugging from a browser
webrtc: no

paths:
  cam:
    source: rpiCamera
    rpiCameraWidth: 1920
    rpiCameraHeight: 1080
    rpiCameraFPS: 25
    rpiCameraBitrate: 3000000
    # One second. Frigate cuts segments and seeks on keyframes; a long GOP
    # gives you a scrubber that jumps and clip boundaries that drift.
    rpiCameraIDRPeriod: 25
    rpiCameraVFlip: true      # camera is mounted upside down
    rpiCameraHFlip: false
    rpiCameraAWB: auto
    rpiCameraDenoise: cdn_off # denoise costs CPU and blurs small moving objects
```

```ini
# /etc/systemd/system/mediamtx.service
[Unit]
Description=MediaMTX
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx.yml
Restart=always
RestartSec=5
# The encoder is the workload; do not let anything else on the Pi outrank it.
Nice=-5

[Install]
WantedBy=multi-user.target
```

Verify from a laptop before involving the cluster:

```bash
ffplay -fflags nobuffer -flags low_delay rtsp://192.168.1.221:8554/cam
```

```bash
ffprobe -v error -show_entries stream=width,height,r_frame_rate,codec_name -of json rtsp://192.168.1.221:8554/cam
```

If `ffplay` shows a stable, correctly-oriented picture for ten minutes with the Pi's load
average under 2.0, the Pi's job is done.

## Why MediaMTX rather than keeping picamera2

MediaMTX's `rpiCamera` source drives libcamera directly and handles the Pi 5's lack of a
hardware encoder itself. It reconnects, it restarts cleanly, it has no Python dependency
tree, and there is nothing in it that you have to maintain.

The alternative — a small picamera2 app publishing to `ffmpeg` — is worth it for exactly one
reason: picamera2 can produce a **second, low-resolution stream** essentially for free from
the ISP, and encoding a 640×360 substream is cheap. That would let Frigate detect on the
substream and record the main one, saving cluster CPU. With NVDEC on the 1080 Ti that saving
is not worth the code, so: MediaMTX now, revisit if you add cameras.

## Choosing resolution and frame rate

| Profile | CPU | Bitrate | When |
|---|---|---|---|
| 1920×1080 @ 25 | ~35–50 % | 3 Mbit | **Default** |
| 1920×1080 @ 15 | ~25 % | 2 Mbit | If thermals are a problem |
| 1280×720 @ 25 | ~20 % | 1.5 Mbit | Slow uplink, or a second camera on the same Pi |
| 2304×1296 @ 20 | ~70 % | 5 Mbit | Only if you need to read faces at distance |
| 4608×2592 | no | — | The sensor can, the CPU cannot |

Resolution beats frame rate for detection. 25 fps is smooth enough for a doorbell and leaves
headroom; going to 50 pushes all four cores to ~80 % and buys nothing.

Watch the temperature for a full day before calling it done:

```bash
vcgencmd measure_temp; vcgencmd get_throttled
```

`get_throttled` returning anything but `0x0` means the encoder is being starved, which will
look like a network problem for as long as you let it.

## Night

`imx708_wide_noir` has no IR-cut filter, so:

- Daytime colour skews red/purple. The NoIR tuning file compensates partly; expect a cast
- At night, **a NoIR sensor without IR illumination is just a dark sensor**. An IR
  illuminator does more for detection accuracy than any model choice
- If you later add IR, turn off `rpiCameraDenoise` experiments and re-check detection: IR
  scenes are noisy and denoise interacts badly with small moving objects

## Security

The RTSP endpoint has no authentication. That is acceptable *only* because it never leaves
the LAN:

- Do not port-forward 8554
- Optionally bind MediaMTX to the LAN interface and firewall the rest
- The cluster dials **out** to the Pi; the Pi opens no connections inward and holds no
  credentials — a compromised Pi leaks a video feed, not the account

This is strictly better than today, where the Pi holds long-lived API credentials
(`Config.AUTH_CREDENTIALS`, hardcoded `admin`/`admin`) and can upload to the backend.

## What happens to the Python code

```
python/
├── legacy/              ← everything below moves here, kept for reference, not run
│   ├── main.py
│   ├── camera_manager.py
│   ├── motion_detector.py
│   ├── video_handler.py
│   ├── settings_manager.py
│   ├── api_client.py
│   ├── web_server.py
│   └── raspberry_stream_and_post.py
├── bridge/              ← new: the MQTT → HTTP bridge that runs in the cluster
│   ├── main.py
│   ├── Dockerfile
│   └── requirements.txt
└── deploy/              ← new: what actually goes on the Pi
    ├── mediamtx.yml
    ├── mediamtx.service
    └── install.sh
```

`motion_detector.py` is worth reading once more before it goes — the ROI polygon handling and
the recording-extension state machine are the two ideas that carry over conceptually into
Frigate's zones and `record.events.post_capture`. The code does not carry over; the thinking
does.

## Cutover

The one genuinely non-reversible-in-the-moment step, because both programs want the camera:

```bash
ssh rpi 'sudo systemctl stop motion-detection'    # or however main.py is started today
ssh rpi 'sudo systemctl start mediamtx'
```

Have the rollback ready before you run it — the old agent starting again is one command, and
it is worth confirming that it does before you need it at 23:00.

## Later: more cameras

Nothing in this design is single-camera. A second Pi runs the same MediaMTX config with a
different path name; Frigate gains a second `cameras:` block; the app gains a camera filter.
The 1080 Ti has headroom for roughly ten 1080p cameras at 5 detect-fps, so the constraint
will be cluster CPU for recording remux, not inference.
