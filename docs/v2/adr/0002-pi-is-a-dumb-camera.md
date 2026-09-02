# 0002 — The Pi only captures, encodes and publishes

**Status:** proposed · **Date:** 2026-09-02

## Context

Today the Pi decides what is motion, records it, holds backend credentials, uploads clips,
polls settings every 60 s, and serves an MJPEG stream. It also JPEG-encodes every frame in
Python at 1080p to do so.

The Pi 5 has **no hardware H.264 encoder**, so every encode is CPU. The current design
encodes twice — JPEG per frame for detection *and* H.264 while recording — on the machine
least able to afford it, while a 6-core i5 with an idle 1080 Ti sits two metres away.

## Decision

The Pi runs MediaMTX and nothing else: open the camera, encode one H.264 stream, serve RTSP
on the LAN. All decisions move to the cluster.

## Consequences

**Good.** Pi CPU drops from pegged to roughly a third of one core's worth of headroom spare.
The Pi holds no credentials and opens no outbound connections, so compromising it leaks a
video feed rather than the account. Detection logic becomes deployable — you change a
threshold with a Flux commit instead of an SSH session. Adding a second camera is a config
block, not a second copy of the codebase.

**Bad.** The LAN link becomes load-bearing: no network, no detection. The current design
would at least keep recording locally. Given both boxes are on the same gigabit switch this
is acceptable, and a camera that cannot notify you is not doing its job either way.

**Also.** Continuous streaming means continuous bandwidth (~3 Mbit) and continuous decode in
the cluster, where before both were bursty. NVDEC makes the decode side free.

## Rejected alternatives

**Keep detection on the Pi, stream to the cluster for recording only.** Halfway house: still
burns Pi CPU, still can't do object detection, and now two components own "was that motion".

**Move the whole thing onto the Pi with a Coral TPU.** Would work, and is the standard
Frigate answer. Rejected because the 1080 Ti already exists, is idle, and unlocks the vision
model that a Coral cannot run.
