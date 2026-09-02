# 0001 — Frigate is the detection and recording engine

**Status:** proposed · **Date:** 2026-09-02

## Context

The goal list — a region of interest, notifications on motion in it, Ring-style playback,
object labels from the GPU, and a live view that is actually live — maps onto a set of
features that a modern NVR has and the current `python/` + `api/` stack does not.

Estimating the build honestly, on top of what exists today:

| Feature | Build it | Frigate |
|---|---|---|
| Zones with per-zone object rules | ~1 week | config |
| Pre-roll (record before the trigger) | ~1 week — needs a ring buffer and segment writer | on by default |
| Object detection + tracking on a GPU | 2–3 weeks | config |
| Retention budgets per severity | ~3 days (exists, roughly) | config |
| WebRTC / MSE / HLS restreaming | 2–3 weeks | bundled (go2rtc) |
| Scrubbable timeline | ~1 week — needs preview generation | on by default |
| Snapshots, thumbnails, best-frame selection | ~3 days | on by default |
| Semantic search over events | 2+ weeks | config |
| Custom classifiers trained from your own data | weeks | a UI |

That is a quarter of work to reach a worse version of something that exists, is maintained,
and is specifically good at this.

## Decision

Adopt Frigate as the engine: ingest, motion, zones, object detection, tracking, recording,
retention, snapshots, previews and live restreaming. Keep the Vue app and the Symfony API as
the product layer on top.

## Consequences

**Good.** Every goal in the brief is reachable in weeks instead of months. ~1500 lines of
Python and PHP are deleted. Pre-roll, previews and NVDEC arrive for free. The GPU becomes a
config flag rather than a project. Upstream keeps improving it.

**Bad.** An external dependency with its own config format, release cadence and opinions.
Upgrades need attention. One of its opinions — that it owns its own config file — conflicts
with pure GitOps ([0005](0005-frigate-config-on-pvc.md)). And there is a real learning curve
in tuning masks and zones; badly-tuned Frigate is noisier than the current system.

## Rejected alternatives

**Extend the existing Python detector.** Total control, no new dependency, and the code is
already understood. Rejected on cost: the feature list above is not a matter of effort but of
scope, and the parts that are genuinely yours (the app, the session model, the notification
rules) get none of that time.

**MotionEye / Shinobi / ZoneMinder.** Older architectures, weaker or no first-class object
detection, no bundled WebRTC, less active development.

**A cloud service.** Defeats the point. Everything here is deliberately local.
