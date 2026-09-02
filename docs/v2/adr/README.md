# Decisions

Short records of the choices this plan rests on, and what was rejected. Same idea as
[`homelab-cluster/docs/adr/`](../../../../homelab-cluster/docs/adr/): if you later wonder
"why on earth did we…", the answer is here.

| # | Decision | Status |
|---|---|---|
| [0001](0001-frigate-as-engine.md) | Frigate is the detection and recording engine | proposed |
| [0002](0002-pi-is-a-dumb-camera.md) | The Pi only captures, encodes and publishes | proposed |
| [0003](0003-webrtc-for-live.md) | WebRTC is the primary live transport | proposed |
| [0004](0004-tailscale-for-remote.md) | Remote access over Tailscale, not the Cloudflare Tunnel | proposed |
| [0005](0005-frigate-config-on-pvc.md) | Frigate's config lives on a writable PVC, not a ConfigMap | proposed |
| [0006](0006-keep-symfony-bff.md) | Keep the Symfony API as a BFF | proposed |
| [0007](0007-fcm-for-push.md) | FCM for push notifications | proposed |

All are **proposed** until Phase 0 in [../09-roadmap.md](../09-roadmap.md) confirms them.
