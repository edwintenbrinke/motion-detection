# Soak logger — Phase 1 verification scaffolding

Not part of the camera. This exists because Phase 1's done-criteria are a claim about **24
hours** — "stable for 24 h, load average < 2.0, `get_throttled` returns `0x0`" — and a claim
about 24 hours cannot be checked by looking once.

Every five minutes it appends one line to `/var/log/mediamtx-soak.log`:

```
2026-09-03T18:39:39+02:00 state=active ready=true restarts=0 load=0.80 temp=85.6'C throttled=0xe0006 enc_cpu=64.6
```

| Field | Why it is there |
|---|---|
| `state` | systemd's view: is the unit up |
| `ready` | MediaMTX's view: is the `cam` path actually publishing. A unit can be `active` while the camera is dead |
| `restarts` | `Restart=always` hides crash loops. If this climbs, "it was up when I looked" is not "it stayed up" |
| `load` | The roadmap's < 2.0 |
| `temp`, `throttled` | The roadmap's `0x0`, and the reason it currently is not |
| `enc_cpu` | The encoder child (`mtxrpicam`), as a share of one core |

## Install

```bash
ssh rpi '~/mediamtx-deploy/soak/install.sh'
```

## Reading it

```bash
ssh rpi 'tail -20 /var/log/mediamtx-soak.log'
```

Any sample that is not clean, across the whole file:

```bash
ssh rpi "grep -v 'state=active ready=true' /var/log/mediamtx-soak.log; grep -v 'throttled=0x0 ' /var/log/mediamtx-soak.log | wc -l"
```

## Uninstall

Once the phase is signed off. Or leave it — it costs one line every five minutes, and it is
the only thing on the Pi that would notice a slow degradation.

```bash
ssh rpi 'sudo systemctl disable --now mediamtx-soak.timer && sudo rm -f /etc/systemd/system/mediamtx-soak.{timer,service} /usr/local/bin/mediamtx-soak && sudo systemctl daemon-reload'
```
