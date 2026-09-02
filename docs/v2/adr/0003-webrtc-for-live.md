# 0003 — WebRTC is the primary live transport

**Status:** proposed · **Date:** 2026-09-02

## Context

The live view is `<img src="/api/video/stream-alt">` — MJPEG, generated frame by frame on the
Pi, proxied through a PHP process that stays open for as long as anyone is watching. It costs
roughly 15 Mbit/s for a 1080p picture that H.264 sends in 3, it cannot seek, and it has a
[documented memory-growth problem](../../troubleshooting.md#live-view-memory-growth).

## Decision

WebRTC (WHEP, served by the go2rtc bundled in Frigate) is the primary live transport, with a
documented fallback ladder: WebRTC → MSE over WebSocket → LL-HLS → still-image polling. The
app shows which rung it is on.

## Consequences

**Good.** 0.1–0.5 s latency instead of several seconds. Five times less bandwidth. No PHP
process per viewer. The same decoded source feeds every protocol, so fallbacks cost nothing
extra.

**Bad.** WebRTC needs a UDP or direct-TCP path, which an HTTP-only tunnel cannot provide —
this is one of the reasons for [0004](0004-tailscale-for-remote.md). It is also more moving
parts than an `<img>` tag: ICE, a signalling exchange, and reconnection logic in the app.

**Mitigation.** The MSE-over-WebSocket rung works anywhere plain HTTP works, at ~1 s. That
is the safety net, and it is still an order of magnitude better than today.

## Rejected alternatives

**LL-HLS as primary.** Works everywhere, no ICE, simpler. At 2–5 s it does not feel live —
and "is someone at the door right now" is a question with a latency requirement.

**Keep MJPEG.** Only defensible as the bottom rung of the ladder, for a still image when
everything else has failed.
