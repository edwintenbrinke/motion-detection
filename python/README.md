# Raspberry Pi camera

**This is being rebuilt.** The full plan is [../docs/v2/README.md](../docs/v2/README.md);
the Pi-specific part is [../docs/v2/08-pi-agent.md](../docs/v2/08-pi-agent.md).

| Folder | What it is |
|---|---|
| [`deploy/`](deploy/) | **v2, target state.** MediaMTX config + systemd unit — the Pi becomes a plain RTSP camera, nothing more |
| [`bridge/`](bridge/) | **v2, new.** The MQTT → HTTP service that runs in the cluster, not on the Pi |
| [`legacy/`](legacy/) | **v1, frozen.** The old capture/detect/upload/serve agent. Kept for reference and rollback only — not run, not developed further |

## Running the Pi today

Nothing runs on the Pi right now (per the user, 2026-09-02). When Phase 1 of the roadmap
lands, this section becomes "how to install `deploy/`"; until then, `legacy/` is what would
be started if you needed the old behaviour back:

```bash
cd ~/motion-detection/python/legacy
python3 main.py
```

See [`legacy/README-old.md`](legacy/README-old.md) for the old agent's own documentation
(endpoints, detection algorithm, settings it polls) — kept verbatim for reference.

## What's replacing it, and why

The old agent JPEG-encodes every frame in Python and diffs pixels to decide "motion" — on a
Raspberry Pi 5, which has **no hardware H.264 encoder**, that is a lot of CPU spent on a
technique that cannot express "region of interest with per-zone rules" or "what kind of
object is this". v2 moves all of that to Frigate, running in the Kubernetes cluster on
`edwin-gpu`, and reduces the Pi to one job: point the camera, encode once, publish RTSP.

Full reasoning: [../docs/v2/adr/0001-frigate-as-engine.md](../docs/v2/adr/0001-frigate-as-engine.md)
and [../docs/v2/adr/0002-pi-is-a-dumb-camera.md](../docs/v2/adr/0002-pi-is-a-dumb-camera.md).
