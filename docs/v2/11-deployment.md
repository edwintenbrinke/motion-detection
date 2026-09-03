# The app, deployed

`https://motion.edwintenbrinke.nl`. One app, one hostname, no acceptance/production split
— the game has that because it has players; this has one user.

## Shape

```
phone / browser
      │  https://motion.edwintenbrinke.nl
      ▼
Cloudflare Tunnel ──► envoy-external ──┬── /            ──► motion-web   (the built SPA on nginx)
                                       └── /api, /live  ──► motion-api   (Symfony + nginx)
                                                                 │
                                                                 ├─ MySQL          (its own pod, NVMe)
                                                                 └─ Frigate        (cluster-internal only)
LAN only:  app ──► 192.168.1.248:1984  ──► go2rtc WebRTC
```

No new tunnel entry, certificate or DNS record was needed. The tunnel already carries
`*.edwintenbrinke.nl`, and external-dns writes the record from the HTTPRoute itself.

## "Media is only reachable from the application"

This is a property of the deployment, not a promise in a comment:

- **Frigate has no HTTPRoute and no tunnel entry.** Its only addresses are a cluster-internal
  Service and a LAN LoadBalancer. There is no hostname that reaches it from the internet.
- **The HTTPRoute has exactly two backends**, motion-api and motion-web. An earlier draft of
  it routed `/live` straight to `frigate:1984`; that would have made every live stream
  world-readable to anyone who guessed the path.
- Every clip, thumbnail, snapshot and live frame is fetched by nginx *inside the motion-api
  pod*, after PHP has said yes.

Verified from outside: `motion.edwintenbrinke.nl/api/config`,
`/api/voordeur/latest.jpg` and `/api/events/<id>/clip.mp4` — Frigate's own API paths — all
404, because they hit Symfony's router, which has no such routes.

### Two credentials, because one cannot cover both cases

| Consumer | Credential | Why |
|---|---|---|
| The app's own API calls | JWT cookie | Ordinary session; the app can set headers |
| `<img>`, `<video>`, notification images | **Signed URL** (HMAC, 10 min) | None of these can send an `Authorization` header |
| Live view (`/live/…`) | Either | The WebSocket cannot send a header; the HLS *segments* cannot carry a signature |

The signed URLs are minted inline on every event (`media.thumbnail|snapshot|clip`, one
`expires_at` for all three, so the app refreshes the set rather than a trickle).

The live view accepts a session cookie **as well as** a signature, and it has to: go2rtc's
HLS playlist points at its segments with relative URLs, so every follow-up request the
player makes arrives without the `exp`/`sig` that fetched the playlist. Signing the playlist
body would mean rewriting HLS in flight. A live session is the stronger credential anyway;
the signature exists for the consumers that cannot hold a cookie at all.

### PHP decides, nginx moves

`MediaController` verifies the signature and returns an empty response carrying
`X-Accel-Redirect: /_frigate/…`. nginx then fetches the bytes from Frigate over the cluster
network. A clip never enters a PHP worker.

`/_frigate/` is an `internal` location, so it is not routable from outside — the only way in
is through a controller that checked a signature first.

> **Measured caveat.** Frigate answers **200** to a ranged GET on
> `/api/events/<id>/clip.mp4`, so seeking inside an event clip re-downloads it. nginx
> forwards `Range` and buffers nothing; the limit is upstream. Event clips are a megabyte or
> two, so it costs nothing today. Scrubbing a whole recording is a different endpoint
> (`/vod/`, HLS) and a feature that does not exist yet — HANDOFF H4.

## What the app actually gets today

Verified end to end over the public hostname, logged in as a real user:

| | |
|---|---|
| Login → JWT cookie | ✅ |
| `/api/user/initialize` | ✅ |
| `/api/cameras` | ✅ reads Frigate's live config: `voordeur`, 1920×1080, retention 3/30/7 |
| `/api/events` | ✅ with inline signed media on every row |
| Signed thumbnail / snapshot | ✅ real JPEGs, 191×175 and 1920×1080, **with no session cookie at all** |
| Signed clip | ✅ `video/mp4`, 1.1 MB |
| Tampered / expired / missing signature | ✅ 403 |
| Live: **MSE over WebSocket** | ✅ `101 Switching Protocols` through the tunnel |
| Live: LL-HLS master + variant playlist | ✅ |
| Clip playback in a real browser | ✅ 1920×1080, decoded and playing from the signed URL |
| Live video in a real browser | ✅ MSE, 1920×1080, playing, badge reads "Live · ~1 s" |
| Live: single frame | ✅ 1920×1080 JPEG |
| Live without either credential | ✅ 403 |
| WebRTC rung | offered LAN-only, and **a browser will not use it at all** — see below |

### The WebRTC rung cannot work from a browser, and that is not fixable here

The rung points at `http://192.168.1.248:1984`. The app is served over HTTPS, so the browser
refuses it as mixed content before it ever reaches the network — on the LAN as much as
remotely. Confirmed in Chrome: *"Access to fetch at 'http://192.168.1.248:1984/...' from
origin 'https://motion.edwintenbrinke.nl' has been blocked."*

This is not a fault in the ladder; it is the ladder working. The app tries the rung, is
refused, drops to MSE and says so — "Verbonden van buitenaf. Ongeveer een seconde
vertraging, dat is normaal." One second is a perfectly good live view.

Getting WebRTC's 0.2 s back means one of: a certificate for that LAN address (awkward for an
IP), or the Android app permitting cleartext to that one host through a network security
config. The second is the realistic one, and it only helps the native app. Until then the
rung is dead weight for web clients, and it is left in place because it costs one failed
fetch and it is what the native app will use.

## The event feed is filled by polling, for now

Nothing yet copies Frigate's events into the app's database — that is Phase 6's MQTT bridge.
The difference between "the app works" and "the app looks broken" should not be a whole
message broker, so `app:frigate:sync-events` polls Frigate's events API every minute
(a CronJob) and upserts on Frigate's own id.

It is idempotent, so a run after an outage backfills rather than duplicates. When the
bridge lands it takes over the live path and this stays useful as a **reconciler**: MQTT
drops messages when nobody is listening, and a system that can only learn about events in
real time can never catch up.

## Testing it

The browser half cannot be checked with curl, and it is where the interesting failures live.
`docs/v2/` has no test harness for it; what was used is a headless run against the deployed
site, which is worth repeating after a deploy:

```bash
docker run --rm -e MOTION_USER=… -e MOTION_PASS=… mcr.microsoft.com/playwright:v1.49.0-jammy   bash -lc 'npx playwright install chrome && node test.mjs'
```

> **Use `channel: 'chrome'`, not the bundled Chromium.** Playwright's Chromium ships without
> proprietary codecs, so every H.264 stream fails with
> `DEMUXER_ERROR_NO_SUPPORTED_STREAMS` and both the clip player and the live view look
> broken when they are not. That cost a round of chasing a bug that was in the test.

## Running it

Images are built on `edwin-server` (amd64, native — the Mac is arm64) and pushed to GHCR
under the same account and pull secret the game uses.

```bash
rsync -az --exclude .git --exclude node_modules --exclude vendor ./ 192.168.1.253:~/build/motion-detection/
```

```bash
ssh 192.168.1.253 'cd ~/build/motion-detection && docker build -f api/Dockerfile.prod -t ghcr.io/edwintenbrinke/motion-api:vX.Y.Z . && docker push ghcr.io/edwintenbrinke/motion-api:vX.Y.Z'
```

Then bump the tag in `homelab-cluster/kubernetes/apps/motion/motion-api/app/helmrelease.yaml`
and push; Flux does the rest. There is no CI for this yet — that is a deliberate gap, not an
oversight: one app, one user, and a pipeline is worth building when the deploys become
boring.

### Creating the login

```bash
kubectl exec -n motion deploy/motion-api -- env MOTION_USER_PASSWORD='…' php bin/console app:user:create --username edwin
```

Non-interactive on purpose: `kubectl exec` has no TTY, and `askHidden()` simply fails there.
The command also creates the `Settings` row, without which `/api/user/initialize` 404s and
the app reads it as a broken login rather than a missing record.

## Android, when you get to it

The deep-link config already targets this hostname (`web/scripts/android-postsync.mjs`), and
the API already allows the two origins a Capacitor WebView presents:

```
^(https://motion\.edwintenbrinke\.nl|https://localhost|capacitor://localhost)$
```

The auth cookie is `SameSite=None; Secure`, so it rides along cross-origin.

**One thing still needs deciding, and it is yours:** a Capacitor build with bundled assets
calls the API cross-origin, which works but means `VITE_API_BASE_URL` must be the absolute
hostname at build time (it is currently `""`, correct for the browser and wrong for the
phone). The alternative is pointing Capacitor's `server.url` at the live site, which makes
the app a thin shell — same-origin, nothing to configure, no offline shell.

**And `/.well-known/assetlinks.json` does not exist yet.** nginx is configured to serve it
with the right content type, but the file needs your app's signing-certificate fingerprint,
which only exists once you have built and signed the APK. Without it a tapped notification
opens the browser instead of the app (HANDOFF H6).

## Still missing

**The plan for all of it is [12-open-work.md](12-open-work.md)**, with causes diagnosed
against the running system rather than guessed. Short version:

- **Refreshing logs you out** — the cold-start lock is right for a phone with a fingerprint
  and wrong for a browser without one
- **The live view goes choppy after a refresh** — three separate causes, all found
- **The clip player reports the wrong duration** — Frigate's fMP4 carries none, and the
  player believes it anyway
- **Zones and masks** (H9) — the editor is built and has nothing to save to. The highest
  value item here: nothing is scoped, so every person anywhere in frame is an alert
- **Timeline** (H4) — built, and the endpoint it needs returns 404
- **No buffer around clips** — a 3-second event gives a 3.037-second clip. The footage
  either side is retained; the clip endpoint just does not include it
- **Events cannot be deleted** — and the sync never removes, so anything deleted in Frigate
  lives on in the feed pointing at media that 404s
- **No dashboard** — Frigate already serves Prometheus metrics and the cluster already runs
  Grafana; nothing is wired between them
- **Push** (H5) — needs Phase 6 and a `google-services.json`
- **Search and date filters** (H7) — `from`, `to`, `q` are still ignored by `EventController`
- **No CI** — images are built by hand, as above
