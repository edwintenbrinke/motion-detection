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
| Cooling | Active cooler required for sustained encoding — **not fitted**, see [heat](#the-one-thing-that-is-not-fine-heat) |

Mounted upside down: the API currently corrects this with an ffmpeg vertical flip on every
recording. Fix it at capture with `vflip` and delete an entire transcode pass.

## What runs: MediaMTX

One binary, one config, one unit. It opens the camera through libcamera, encodes H.264 in
software, and serves RTSP. It also speaks WebRTC and HLS, which is handy for debugging
straight from a laptop without involving the cluster.

```yaml
# /etc/mediamtx.yml  — the real file lives at ../../python/deploy/mediamtx.yml
logLevel: info
logDestinations: [stdout]        # systemd puts this in the journal

rtspAddress: :8554
rtsp: true
rtspTransports: [tcp]            # TCP only; stops the UDP RTP ports being opened at all
rtmp: false
hls: false                       # flip to true temporarily when debugging from a browser
webrtc: false
srt: false
moq: false                       # on by default since 1.20, listens on 8892/8893

api: true                        # read-only, loopback only: "is it publishing?"
apiAddress: 127.0.0.1:9997

paths:
  cam:
    source: rpiCamera
    rpiCameraWidth: 1920
    rpiCameraHeight: 1080
    rpiCameraFPS: 25
    rpiCameraCodec: softwareH264  # the BCM2712 has no hardware encoder; say so out loud
    rpiCameraBitrate: 3000000
    # One second. Frigate cuts segments and seeks on keyframes; a long GOP
    # gives you a scrubber that jumps and clip boundaries that drift.
    rpiCameraIDRPeriod: 25
    rpiCameraVFlip: true          # camera is mounted upside down
    rpiCameraHFlip: false
    rpiCameraAWB: auto
    rpiCameraDenoise: cdn_off     # denoise costs CPU and blurs small moving objects
```

Booleans are `true`/`false`, not `yes`/`no`: MediaMTX parses with yaml.v3, which does not
treat `yes` as a boolean. Every value above is a deliberate override; everything else keeps
the binary's defaults.

```ini
# /etc/systemd/system/mediamtx.service
[Unit]
Description=MediaMTX
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx.yml
Restart=always
RestartSec=5
# The encoder is the workload; do not let anything else on the Pi outrank it.
Nice=-5

[Install]
WantedBy=multi-user.target
```

## Pin the version, and know why

`python/deploy/install.sh` pins **MediaMTX 1.20.1** by version *and* sha256. The version
matters more than it looks: since 1.10 MediaMTX embeds its **own libcamera build**
(`mtxrpicam_64/libcamera.so.9.9`, with the `imx708_wide_noir` tuning file), unpacked to
`/dev/shm` at startup. The Pi's system libcamera — 0.3.0 on this bookworm image — is not in
the path at all. That is what makes upgrading MediaMTX a safe, self-contained step rather
than something entangled with `apt`.

Verify from a laptop before involving the cluster. MediaMTX only accepts TCP, and ffmpeg
defaults to UDP, so the transport has to be named:

```bash
ffplay -rtsp_transport tcp -fflags nobuffer -flags low_delay rtsp://192.168.1.221:8554/cam
```

```bash
ffprobe -v error -rtsp_transport tcp -show_entries stream=width,height,r_frame_rate,codec_name -of json rtsp://192.168.1.221:8554/cam
```

On the Pi itself, without a video player anywhere:

```bash
curl -s localhost:9997/v3/paths/get/cam
```

## What it actually does — measured 2026-09-03

Installed and running. A 30-second capture pulled over the LAN, and the Pi watched while it
streamed:

| | Planned | Measured |
|---|---|---|
| Resolution | 1920×1080 | 1920×1080, H.264 Constrained Baseline, yuv420p |
| Frame rate | 25 | 25.00 (750 frames in 29.98 s, no drops) |
| Bitrate | 3 Mbit | 3.00 Mbit (3 004 702 bps) |
| Keyframes | every 25 frames | every 25 frames, all 29 intervals |
| Orientation | upright via `vflip` | upright |
| Encoder CPU | ~35–50 % of 4 cores | **~65 % of one core** — 16 % of the box |
| Load average | < 2.0 | 0.7–0.8 |

The encode budget in [02-video-transport.md](02-video-transport.md#pi-5-encode-budget) was
pessimistic: OpenH264 at 1080p25 costs about two thirds of a single Pi 5 core, not half the
machine. There is room for a second camera on this board, or for 2304×1296 if the picture
ever needs it.

The colour is pink-and-green in daylight, exactly as the NoIR section below predicts.

## The one thing that is not fine: heat

`vcgencmd get_throttled` reads **`0xe0006`**, not `0x0`. Decoded: soft temperature limit
reached, ARM frequency capped, currently throttled. The die sits at **83–86 °C** while
streaming, and it was already at **63.7 °C idle, with nothing running at all**.

There is no active cooler on this Pi. `/sys/class/thermal/` has one thermal zone and **zero
cooling devices**; `/sys/class/hwmon/` has no fan. The "active cooler required" line in the
Hardware table above was written as a recommendation and read as one.

It is not currently costing frames — the 25.00 fps and 3.00 Mbit above were measured during
a window in which the throttle bits were set — because 65 % of one core survives a clock cap
fine. What it costs is margin: a hot summer day, an IR illuminator, a second camera, or
Frigate asking for a higher bitrate all land on a chip that is already at its limit, and the
first symptom will be dropped frames that look exactly like a network fault.

**Fit the active cooler.** It is a €5 part and it is the last open item in Phase 1.

## Why MediaMTX rather than keeping picamera2

MediaMTX's `rpiCamera` source drives libcamera directly and handles the Pi 5's lack of a
hardware encoder itself. It reconnects, it restarts cleanly, it has no Python dependency
tree, and there is nothing in it that you have to maintain.

The alternative — a small picamera2 app publishing to `ffmpeg` — is worth it for exactly one
reason: picamera2 can produce a **second, low-resolution stream** essentially for free from
the ISP, and encoding a 640×360 substream is cheap. That would let Frigate detect on the
substream and record the main one, saving cluster CPU. With NVDEC on the 1080 Ti that saving
is not worth the code, so: MediaMTX now, revisit if you add cameras.

Since 1.20 MediaMTX does this itself: `rpiCameraSecondary: true` on a second path gives the
low-resolution stream straight off the ISP, no Python involved. That removes the only real
argument picamera2 had. It is deliberately not switched on yet — Phase 2 should first see
what Frigate's CPU actually looks like detecting on the full stream, because a second path
is a second encode on a Pi that is already thermally out of headroom (see below).

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

Watch the temperature for a full day before calling it done. Not by remembering to look —
`python/deploy/soak/` installs a timer that samples state, readiness, restart count, load,
temperature, throttle bits and encoder CPU every five minutes into
`/var/log/mediamtx-soak.log`:

```bash
ssh rpi 'tail -20 /var/log/mediamtx-soak.log'
```

```bash
ssh rpi "grep -c 'throttled=0x0 ' /var/log/mediamtx-soak.log"   # want: all of them
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

**In the event this was a non-event** (2026-09-03): nothing held the camera. There was no
`motion-detection` unit, no `main.py`, and `fuser /dev/video0` came back empty, so
`systemctl start mediamtx` was the whole cutover. The rollback path is still worth keeping
in mind, but it now means "start the legacy agent by hand", not "stop a running service".

## Later: more cameras

Nothing in this design is single-camera. A second Pi runs the same MediaMTX config with a
different path name; Frigate gains a second `cameras:` block; the app gains a camera filter.
The 1080 Ti has headroom for roughly ten 1080p cameras at 5 detect-fps, so the constraint
will be cluster CPU for recording remux, not inference.
