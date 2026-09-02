# Video transport

How pixels get from the sensor to the phone. This is the "betere strategie voor de video
feed" and it is mostly about doing the expensive thing **once**.

## The rule

> Encode once on the Pi. Decode once in the cluster, on the GPU. Restream N times.

Today the video is encoded twice (JPEG per frame *and* H.264 for the recording),
re-encoded a third time by ffmpeg to flip it, and shipped to the app in the least efficient
format that exists. v2 has exactly one encode and, for recordings, zero transcodes.

## Numbers first

Everything below follows from these. 1080p, one camera.

| Path | Bitrate | Per hour | Per day (24/7) |
|---|---|---|---|
| MJPEG 1080p @ 15 fps (today's live view) | ~15 Mbit/s | 6.7 GB | 162 GB |
| H.264 1080p25 @ 3 Mbit (v2) | 3 Mbit/s | 1.35 GB | 32 GB |
| H.264 720p20 @ 1.5 Mbit (a fine fallback) | 1.5 Mbit/s | 0.68 GB | 16 GB |
| Detect substream 640×360 @ 5 fps | ~0.4 Mbit/s | 0.18 GB | — |

Five times less bandwidth for a *better* picture, and the LAN link stops being a
consideration at all. Over 4G, 3 Mbit is a live view that actually works; 15 Mbit is not.

### Pi 5 encode budget

The Pi 5 has **no hardware H.264 encoder**, so this is CPU. Rough field numbers on a
Pi 5 with `libx264`-class settings:

| Encode | CPU (of 4 cores) | Verdict |
|---|---|---|
| 1080p @ 25 fps | ~35–50 % | The target. Comfortable |
| 1080p @ 30 fps | ~50–60 % | Fine, little gained over 25 |
| 1080p @ 50 fps | ~80 % on all cores | No |
| 4K @ 15 fps | ~90 %+ | No |
| Today: JPEG 1080p30 in Python + H.264 while recording | pegged | This is the current state |

**1080p at 25 fps, 3 Mbit, keyframe every second** is the recommendation. Frame rate is
worth far less than resolution for detection, and 25 is plenty for a doorbell view.

An active cooler is not optional: sustained software encoding will thermally throttle a
bare Pi 5, and a throttled encoder drops frames, which looks exactly like a network problem.

### Keyframes matter more than you would expect

Set the IDR/keyframe interval to **1 second** (i.e. every 25 frames). Frigate cuts recording
segments on keyframes and seeks on keyframes. With a 5- or 10-second GOP you get coarse
segment boundaries, sloppy clip start times, and a scrubber that jumps. One second costs a
few percent of bitrate and buys a timeline that feels right.

## The two hops

### Hop 1 — Pi → cluster: RTSP

Plain RTSP over TCP on the LAN. Not WebRTC, not HLS: this hop wants a boring, resumable,
low-overhead pipe that ffmpeg understands, and RTSP is exactly that.

```
rtsp://192.168.1.221:8554/cam
```

Bound to the LAN only. No auth beyond that is worth the trouble here — but do **not** let
this port out of the network. See [08-pi-agent.md](08-pi-agent.md) for the MediaMTX config.

One stream, not two. Frigate downscales for detection itself, and with NVDEC on the 1080 Ti
the decode is free — cheaper than making the Pi encode a second stream in software. If the
Pi ever moves to a device *with* an encoder, a dedicated 640×360 substream becomes the
better trade; it is a config change, not a redesign.

### Hop 2 — cluster → phone: pick per situation

go2rtc ships inside Frigate and speaks all of these from the same single decoded source.

| Protocol | Latency | Where it works | Use it for |
|---|---|---|---|
| **WebRTC (WHEP)** | 0.1–0.5 s | LAN only; needs UDP or ICE-TCP | **Primary live view, on the LAN** |
| **MSE over WebSocket** | 0.5–1.5 s | Anywhere HTTP goes, including Cloudflare Tunnel | Live fallback |
| **LL-HLS** | 2–5 s | Everywhere, including restrictive networks | Second fallback |
| HLS (plain) | 5–10 s | Everywhere | Not for live |
| **MP4 with Range** | n/a | Everywhere | Clip playback |
| MJPEG | 1–3 s | Everywhere | Emergency only; the bandwidth is indefensible |
| `latest.jpg` poll | 1 s+ | Everywhere | Thumbnails, the zone editor canvas |

**The live view ladder the app should implement**, in order, falling through on failure:

```
1. WebRTC on the LAN             → 0.2 s.  At home, on wifi
2. MSE over WebSocket            → 1 s.    Remote (through the Cloudflare Tunnel), or UDP blocked
3. LL-HLS                        → 3 s.    When even that fails
4. latest.jpg every second       → still image, but the app is never blank
```

Do not try to be clever about choosing up front — attempt WebRTC, and fall to the next rung
if no video frame has arrived after ~3 seconds. Show which rung you are on in the UI; a live
view that is silently 5 seconds behind is worse than one that says so.

### Playback is a different problem

Live wants latency; playback wants seeking. They share nothing but the source.

| Need | Endpoint | Note |
|---|---|---|
| Play one event | Frigate `/api/events/<id>/clip.mp4` | fMP4, Range-capable, no transcode |
| Scrub a whole hour | Frigate **preview** files | Low-fps timelapse Frigate generates for exactly this |
| Jump to a wall-clock time | Frigate `/vod/...` HLS | For the continuous recording, not just events |
| Thumbnail in a list | `/api/events/<id>/thumbnail.jpg` | Cache aggressively; they never change |

The preview files are the piece that makes a Ring-style timeline cheap. Frigate writes a
compact timelapse per hour per camera; scrubbing that is a few hundred kilobytes instead of
streaming an hour of 1080p. Use previews for the scrubber and switch to the real recording
only when the user stops dragging.

All of these go through the Symfony BFF rather than straight to Frigate, so the app has one
origin, one auth scheme and one place to change. See
[07-api-and-data-model.md](07-api-and-data-model.md#media-tokens).

## Remote access

**Decision: reuse the existing Cloudflare Tunnel**, on its own hostname
(`motion.edwintenbrinke.nl`), the same mechanism `plex.` and `files.` already use. Full
reasoning and the accepted trade-offs: [adr/0004](adr/0004-tailscale-for-remote.md).

The one consequence that actually changes behaviour: **WebRTC does not negotiate through the
tunnel** — no UDP/ICE path — so a remote session lands on the **MSE** rung of the ladder
above (~1 s) instead of WebRTC (~0.2 s). On the LAN, nothing changes: WebRTC still connects
directly. The app must show which rung it landed on, so "remote and a bit delayed" reads as
normal rather than broken.

The shape:

```
phone ──Cloudflare Tunnel──► envoy-external ──► in-cluster
                                                  ├─ motion-api     (app traffic)
                                                  └─ frigate/go2rtc (MSE, HLS, clips — no WebRTC here)
phone ──LAN────────────────► envoy-internal / go2rtc directly ──► WebRTC
```

No new certificate work: `motion.edwintenbrinke.nl` gets an HTTPRoute like any other cluster
hostname and picks up the existing `*.edwintenbrinke.nl` wildcard.

## Migration path

The two hops can be built independently, and both can run alongside the current system:

1. MediaMTX on the Pi publishes RTSP **while** `main.py` keeps running. They both open the
   camera, so this is the one step that needs a cutover — do it when you are ready to stop
   the old agent, not before. Verify with `ffplay rtsp://192.168.1.221:8554/cam`.
2. Frigate ingests that RTSP and restreams. The app's `LivestreamView` swaps its `<img>` for
   a WebRTC player pointing at the BFF. Old MJPEG endpoint stays until the new one is proven,
   then `stream-alt` and `RaspberryApiService` go.
