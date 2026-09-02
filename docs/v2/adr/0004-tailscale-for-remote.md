# 0004 — Remote access over the existing Cloudflare Tunnel

**Status:** accepted (supersedes an earlier Tailscale proposal) · **Date:** 2026-09-02

## Context

The cluster already has a working Cloudflare Tunnel and a Let's Encrypt wildcard for
`*.edwintenbrinke.nl`. This plan originally proposed Tailscale instead, for three reasons:
a camera should not be reachable from the public internet behind auth alone; WebRTC wants a
UDP/direct-TCP path an HTTP tunnel cannot give it; and Cloudflare's terms are written with
sustained video proxying in mind.

**Decision on review (2026-09-02): use the existing Cloudflare Tunnel, not a new Tailscale
setup.** One tunnel/DNS system to operate instead of two, no new client dependency on every
phone, and it is the mechanism already proven for Space Crucible. The concerns above are
real and are accepted as known trade-offs rather than blockers — recorded here so they are
not rediscovered as surprises later.

## Decision

Remote access to the API, event feed and live view goes through the existing Cloudflare
Tunnel, on its own hostname (e.g. `motion.edwintenbrinke.nl`), the same way `plex.` and
`files.` already work. No Tailscale is introduced for this project.

## Consequences

**Good.** Zero new infrastructure — one tunnel, one DNS provider, one cert mechanism,
already battle-tested. No VPN app or tailnet membership required on the phone, which matters
if this is ever shared with someone outside the household. Consistent with how every other
externally-reachable service in this cluster works.

**Accepted trade-offs, not fixed by this ADR:**

- **Live view over the tunnel means the WebRTC (WHEP) rung will not negotiate** — the
  tunnel does not offer WebRTC an ICE/UDP path. The app's fallback ladder
  ([0003](0003-webrtc-for-live.md)) already covers this: remote sessions land on **MSE over
  WebSocket** (~1 s latency) rather than WebRTC (~0.2 s). That is still a large improvement
  over today's MJPEG and is a fine outcome for "checking in from outside", not a regression
  to accept silently — the app must show which rung it is on, as already planned.
- **The camera is reachable wherever the tunnel is** — same trust model as Plex today. Auth
  (JWT + signed media URLs) is what stands between the internet and the footage; there is no
  network-layer backstop the way a VPN provides. Treat this the same way the household
  already treats `plex.edwintenbrinke.nl`: acceptable, not invisible.
- **Cloudflare's terms discourage sustained proxied video.** A phone open on the live view
  for minutes at a time over MSE is real but modest bandwidth (~1–2 Mbit vs. Plex transcodes
  that are already tolerated on the same tunnel). Watch for any enforcement action; the
  fallback if this ever becomes a problem is exactly the Tailscale design below.

## Rejected alternative (this plan's original proposal)

**Tailscale**, kept here rather than deleted because it is the correct fallback if the
Cloudflare-tunnel trade-offs above stop being acceptable — e.g. if WebRTC-quality remote
latency becomes a real requirement, or if Cloudflare pushes back on the traffic pattern. The
full reasoning: private-only exposure, a real UDP/TCP path for WebRTC, no ToS ambiguity, at
the cost of a client dependency (the Tailscale app) on every device and a second network
layer to operate. If reopened, the mechanics are: Tailscale operator in-cluster, `motion.*`
as an A record for the tailnet IP with the Cloudflare proxy off, existing wildcard cert still
validates.

**Plain WireGuard.** Same security properties as Tailscale, more setup per device, no
MagicDNS. Not chosen for the same reason Tailscale was not chosen.

**LAN only.** Simplest and safest, but "kijken terwijl ik niet thuis ben" is the actual
use case, and it is explicitly what tipped this back to the tunnel over doing nothing.
