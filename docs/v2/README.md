# v2 — the plan

This folder describes where the system is **going**. The docs one level up
([../](../README.md)) describe what runs **today**; nothing in this folder is built yet.

## The goal, in one paragraph

An Android app that shows a live view of the camera with sub-second latency, lets you draw
the region you care about, pushes a notification within a few seconds when something moves
in that region, keeps the clip so you can scrub back through the day like a Ring camera,
and labels every clip with *what* it was — a car, a cyclist, the neighbour's cat, or a
delivery driver at the door — using the idle GTX 1080 Ti in `edwin-gpu`. All of it running
in the local Kubernetes cluster, none of it leaving the house.

## The short version of the answer

| Question | Answer |
|---|---|
| Who detects motion and records? | **Frigate**, in the cluster — not the Pi, not Symfony |
| What does the Pi do? | Capture, encode once, publish RTSP. Nothing else |
| How does video reach the app? | **WebRTC** (live) and **MP4/HLS** (playback), restreamed by go2rtc |
| Where does the ROI live? | A Frigate **zone**, edited from the app, written through the API |
| What tags the clips? | YOLOv9 on the 1080 Ti, plus a custom classifier and a local vision LLM |
| How do notifications arrive? | Frigate → MQTT → bridge → Symfony → **FCM** → the app |
| How do I reach it from outside? | The existing **Cloudflare Tunnel**, its own hostname. Live view falls back to MSE (~1s) remotely |
| What happens to the current code? | The Vue app and the Symfony API stay and grow. The Python detector is retired |

The single biggest change: **stop treating the Raspberry Pi as the brain.** Today the Pi
JPEG-encodes every frame in Python, diffs it, records, and re-uploads — while a PHP process
proxies an MJPEG stream to the app. That design cannot give you sub-second live view,
object labels, or a scrubbable timeline no matter how much it is tuned. Move the thinking to
the machine with the GPU and the Pi becomes a reliable camera instead of an unreliable NVR.

## What this is not

It is not a rewrite of the app. The Vue 3 + Capacitor frontend, the JWT/biometric session
model and the Symfony API all survive — they are the *product*. What gets replaced is the
*plumbing* underneath: capture, detection, recording, retention and streaming, which is a
solved problem that Frigate already solves better than a hand-rolled `cv2.absdiff` loop.

## Reading order

| # | Document | Read it for |
|---|---|---|
| 1 | [01-target-architecture.md](01-target-architecture.md) | The shape of the whole thing and why each part exists |
| 2 | [02-video-transport.md](02-video-transport.md) | How pixels get from the sensor to the phone, with the numbers |
| 3 | [03-detection-and-ai.md](03-detection-and-ai.md) | Zones, object detection on the 1080 Ti, and the tagging ladder |
| 4 | [04-notifications.md](04-notifications.md) | Push that is useful instead of annoying |
| 5 | [05-android-app.md](05-android-app.md) | The screens, and what has to change in `web/` |
| 6 | [06-kubernetes.md](06-kubernetes.md) | Namespace, storage, GPU enablement, manifests, sizing |
| 7 | [07-api-and-data-model.md](07-api-and-data-model.md) | New entities, endpoints, media tokens, migration |
| 8 | [08-pi-agent.md](08-pi-agent.md) | What runs on the Pi afterwards, and what gets deleted |
| 9 | [09-roadmap.md](09-roadmap.md) | Phases with done-criteria, effort, risks, rollback |
| 10 | [10-app-v2-implementation.md](10-app-v2-implementation.md) | How the app is actually being built: adapters, the live ladder, build order, progress |
| — | [adr/](adr/) | The seven decisions this plan rests on, and what was rejected |

Cluster-side notes live in the other repo:
[`homelab-cluster/docs/motion-detection.md`](../../../homelab-cluster/docs/motion-detection.md).

## Hardware this plan assumes

| Piece | What it is | Role in v2 |
|---|---|---|
| Raspberry Pi 5 8 GB, `192.168.1.221` | Bookworm, `imx708_wide_noir` (Camera Module 3 Wide NoIR) | Capture + H.264 encode + RTSP |
| `edwin-gpu`, `192.168.1.69` | Talos single-node k8s, i5-8600K, 500 GB NVMe, **GTX 1080 Ti (idle)** | Frigate, inference, API, storage |
| `edwin-server`, `192.168.1.253` | Ubuntu, ~22 TB, NFS exports | Recording storage over NFS |
| Android phone | Capacitor build of `web/` | The product |

Two hardware facts drive a lot of the design and are easy to get wrong:

- **The Pi 5 has no hardware H.264 encoder.** BCM2712 dropped the legacy codec block; it
  only has an HEVC *decoder*. Every frame you encode costs CPU. This is why the plan encodes
  **once**, at a sane resolution and frame rate, and never JPEG-encodes per frame again.
- **The 1080 Ti is Pascal.** FP16 runs at 1/64 rate, so half-precision is a trap — but INT8
  via DP4A is fast, and NVDEC decodes H.264 in hardware for free. Configure for FP32/INT8,
  never FP16.

- [11-deployment.md](11-deployment.md) — how the app is deployed on the cluster, and how media stays reachable only through it
| [12-open-work.md](12-open-work.md) | What is broken, what is missing, and the plan for both |
| [13-timeline-and-players.md](13-timeline-and-players.md) | Why the Tijdlijn page only does live, why the clip player cannot seek, and how to fix both |
