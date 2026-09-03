# Open work — the plan

Five things: three that are broken and two that were never built. Everything below was
diagnosed against the running system on 2026-09-03, not inferred from the code, so the
"cause" sections are findings rather than theories. Where I am guessing, it says so.

Read this, then say **"fix dit allemaal"** and it gets executed in one pass, in the order
below — the order is chosen so each step is verifiable before the next one lands.

| # | What | Kind | Effort |
|---|---|---|---|
| 1 | Refreshing the page logs you out | Bug | small |
| 2 | Live view is choppy after a refresh | Bug, three causes | medium |
| 3 | Clip player shows the wrong time | Bug | small |
| 4 | Zones and motion masks | Missing feature (H9) | large |
| 5 | Timeline | Missing feature (H4) | large |

---

## 1. Refreshing the page logs you out

### What happens

Reload `motion.edwintenbrinke.nl` and you are back at the password prompt, every time.

### Cause

`web/src/lib/coldStart.js` runs on every app boot and calls `resetAppState()`, which sets
`isAppActive = false`. The router guard in `web/src/router/index.js:110` needs three flags:

```js
const unlocked = tokenValid && biometricVerified && appActive;
```

so a valid token is never enough on its own. **That is deliberate and correct on a phone**:
the app relocks when it goes to the background and you unlock with a fingerprint instead of
retyping a password. It is written that way on purpose, and the comment says so.

The problem is that a browser has no fingerprint. The unlock path that makes the lock cheap
on Android does not exist on the web, so the lock degrades into "type your password again,
every refresh".

### Fix

Make the cold-start lock conditional on there being something to unlock *with*.

- In `coldStart.js`, ask the biometric plugin whether biometry is available before clearing
  the flags. `@aparajita/capacitor-biometric-auth`'s `checkBiometry()` already gets called in
  `LoginView.vue`; hoist that check.
- Biometry available (Android) → behave exactly as now.
- Biometry unavailable (browser) → do not clear `isAppActive`; the stored token and the JWT
  cookie are the credential, as in any other web app.
- The relock-after-N-minutes timer (`DEFAULT_RELOCK_MINUTES`) stays on both, because that is
  about walking away from a screen, not about which device you are on.

**Do not** simply delete the cold-start lock. It is the only thing standing between a stolen
unlocked phone and the camera.

### Files

`web/src/lib/coldStart.js`, `web/src/stores/authentication.js`, possibly `LoginView.vue` to
share the biometry probe.

### Verify

Log in, refresh, stay logged in. Then in the Android build: background the app past the
relock window, foreground it, get asked for the fingerprint.

---

## 2. Live view is choppy after a refresh

First load is smooth; after a reload it stutters. Three separate causes, all real, all found
by reading the code against the observed behaviour.

### Cause A — `stop()` does not remove its listeners

`web/src/lib/live/clients/MseClient.js`:

```js
this.ws.onclose = null;
this.ws.onerror = null;
```

The handlers were attached with `addEventListener('close', …)`, not by assigning `onclose`.
Setting the property to `null` removes nothing. So closing the socket still fires

```js
ws.addEventListener('close', () => this.emit('error', new Error('WebSocket gesloten')));
```

into a ladder that has already moved on. The ladder's `generation` guard catches most of
this, but the window between `teardown()` incrementing the generation and the socket
actually closing is exactly the window a refresh opens.

**Fix:** keep references to the bound handlers and `removeEventListener` them, or attach them
with the same `AbortController` signal the client already receives (`signal` is passed into
`start()` and is the cleaner option — one abort removes every listener at once).

### Cause B — `keepUp()` seeks, and seeking on a live MSE stream is visible

Same file:

```js
const MAX_LAG_S = 2;
if (end - el.currentTime > MAX_LAG_S) {
    el.currentTime = end - 0.5;
}
```

`drain()` calls `keepUp()` after **every** appended fragment. Fragments arrive in bursts
through the tunnel, so the buffered end regularly runs more than two seconds ahead of the
playhead, and each burst triggers another hard seek. A hard seek on a live stream is a
visible hitch — do enough of them and you get exactly "choppy".

It is smooth on first load because a fresh connection starts at the live edge with nothing
buffered. After a refresh the browser reconnects to a go2rtc stream that is already running
and gets a backlog immediately.

**Fix, in order of preference:**

1. Raise the threshold and stop seeking for small drift. Nudge with `playbackRate` (1.05 for
   a second) to close a lag of 2–5 s; reserve the hard seek for > 10 s, which is a real
   desync rather than jitter.
2. Rate-limit `keepUp()` so it can act at most once every few seconds instead of once per
   fragment.
3. Only seek while the video is actually playing (`!el.paused && el.readyState >= 3`), so a
   buffering stall is not "corrected" into a further jump.

### Cause C — nothing ever emits `stalled`, so the ladder cannot recover

`ladder.js` has a complete stall path — `phase = 'stalled'`, a `stallTimeoutMs` of 5 s, then
falling to the next rung. No client ever emits the event. `MseClient` emits `firstFrame` and
`error` and nothing else.

So a stream that is *degraded but not dead* — precisely the choppy case — is never detected.
The ladder believes it is playing perfectly.

**Fix:** have `MseClient` (and `HlsClient`, which has the same gap) emit `stalled` from the
video element's own `stalled`/`waiting` events, and emit a recovery signal on `playing` so
the ladder can clear the stall timer instead of falling a rung over a hiccup. The ladder side
already handles both; it just needs to be told.

### Also worth doing while in here

`LivePlayer.vue` tears down correctly on unmount, but a **page refresh** never runs
`onBeforeUnmount` reliably. Add a `visibilitychange`/`pagehide` teardown so the WebSocket is
closed on the way out rather than left for the browser to reap — that is what leaves go2rtc
holding a consumer that then delivers the backlog to the next page load.

### Files

`web/src/lib/live/clients/MseClient.js`, `HlsClient.js`, `web/src/components/live/LivePlayer.vue`.
`ladder.js` should need no change; `ladder.test.js` already covers the stall path and should
stay green.

### Verify

Load the live view, refresh five times in a row, and watch it stay smooth. Then check with
`curl -s localhost:1984/api/streams` inside the Frigate pod that the consumer count returns
to zero after closing the tab, rather than climbing.

---

## 3. The clip player shows the wrong time

### What happens

The event detail shows `0:00 / 0:00`, or a duration far shorter than the event. Measured in
a real browser: a 3-second event reported `duration: 0.999367`.

### Cause

Frigate serves `/api/events/<id>/clip.mp4` as a **fragmented MP4 with no duration in the
header** and no `Content-Length` (confirmed: the response has neither). The browser therefore
reports the duration of what it has buffered so far, which grows as it downloads. Everything
in `VideoPlayer.vue` that reads `el.duration` — the clock, the scrubber `:max`, the
skip-forward clamp — is built on that number.

This is upstream behaviour, not a bug in the player. The player's mistake is trusting it.

### Fix

The app already knows the real duration: `normaliseEvent()` in `web/src/api/contract.js`
computes `duration_s` from `started_at` and `ended_at`, and `EventDetailView` already has the
event.

- Add a `duration` prop to `VideoPlayer.vue`, passed from the event.
- Use `el.duration` only when it is finite and > 0; otherwise fall back to the prop.
- Guard the scrubber, the clock and `skip()` on the resolved value rather than on
  `el.duration` directly.
- While the media duration is unknown, keep the scrubber usable rather than disabled — the
  fallback is accurate to the second because it comes from Frigate's own event record.

### Files

`web/src/components/player/VideoPlayer.vue`, `web/src/views/EventDetailView.vue`.

### Verify

Open an event with a known length. Clock reads `0:00 / 0:03`, the scrubber spans the whole
clip, and skipping forward lands where it should.

---

## 4. Zones and motion masks (HANDOFF H9)

### State

The UI exists and is unused: `web/src/components/zones/ZoneCanvas.vue` and `ZonesView.vue`
are built, and `web/src/api/adapters/bff/zones.js` already codes against four endpoints that
return 404 today:

```
GET  /api/cameras/{cam}/zones     PUT /api/cameras/{cam}/zones
GET  /api/cameras/{cam}/masks     PUT /api/cameras/{cam}/masks
```

Frigate currently has `zones: []` and no `motion.mask`, so nothing is scoped — every person
anywhere in frame is an alert. This is the single highest-value item in this document,
because it is what makes Phase 6's notifications survivable.

### How Frigate takes the write

Two endpoints exist, both verified present on 0.17.2:

- `PUT /api/config/set?…` — sets individual keys, answered 422 to a malformed probe, so it
  is there and wants proper parameters.
- `POST /api/config/save` — takes the whole config file as the body, answered 422 to a junk
  body.

**Frigate 0.17 has auth enabled** (it generated an admin user on first boot), so motion-api
must authenticate before it can write. Decide this first, because it shapes the rest:

- **Option A — write through Frigate's API.** motion-api logs in to Frigate with stored
  credentials and calls `config/set`. Frigate validates, persists to the PVC and reloads
  itself. Correct, and it means Frigate's UI and the app never disagree.
- **Option B — write the YAML on the PVC directly** and ask Frigate to reload. Avoids the
  credential, but means writing a config parser and re-implementing Frigate's validation. Do
  not do this.

Take Option A. Add a `FRIGATE_USER`/`FRIGATE_PASSWORD` to `motion-api-secret`, create that
account in Frigate, and give `FrigateClient` a small token cache.

### Coordinates

Frigate stores zone and mask points as **normalised** `x,y` pairs in `0..1`, in the order
given, as a flat comma-separated string. `ZoneCanvas` works in pixels on the snapshot. The
conversion belongs in one place — put it in `FrigateClient`, not in the Vue component, so the
app never has to know Frigate's string format.

### Shape

```
GET  /api/cameras/{cam}/zones -> { zones: [ { name, points: [[x,y],…], objects: [...],
                                              inertia, loitering_time } ] }
PUT  /api/cameras/{cam}/zones <- { zones: [...] }   ->  204, Frigate reloads
```

Masks are the same with `motion.mask`, which is a list of polygons and has no names.

### Files

New `CameraZonesController`, extensions to `FrigateClient`, `motion-api-secret`,
`docs/v2/07-api-and-data-model.md`.

### Verify

Draw a zone in the app over the front door. `curl /api/config` inside the cluster shows it.
Walk through the zone and the event carries `zones: ["voordeur"]` — today they all carry
`zones: []`, which is the visible proof this works.

---

## 5. Timeline (HANDOFF H4)

### State

Also built and unused: `TimelineStrip.vue`, `TimelinePreview.vue`, `RecordingPlayer.vue`,
`useTimelineGeometry.js` (with tests). One endpoint returns 404:

```
GET /api/cameras/{cam}/timeline?date&tz
  -> { recordings[{start,end,vod_url}], previews[{start,end,preview_url}], events[], expires_at }
```

### What Frigate gives us — all three verified working

| Need | Frigate endpoint | Checked |
|---|---|---|
| Which hours have recordings | `/api/{cam}/recordings?after=&before=` | 200, 104 KB for two hours |
| Scrub cheaply | `/api/preview/{cam}/start/{s}/end/{e}` | 200, returns `src` under `/clips/previews/…` |
| Play a wall-clock range | `/vod/{cam}/start/{s}/end/{e}/index.m3u8` | 200, 20 KB playlist |

The preview files are what make this cheap: a low-fps timelapse per hour, a few hundred
kilobytes, instead of streaming an hour of 1080p to drag a scrubber over it.

### The one hard part

**HLS playlists reference their segments relatively.** This is the same problem already
solved for the live view: the player fetches `index.m3u8` with a signature, then asks for
segments without one. The live proxy handles it by accepting the session cookie as well as a
signature, and `/vod/` and `/clips/` must be added to that same proxy for exactly the same
reason. Do not invent a second mechanism.

Concretely: extend the internal proxy to cover `/api/vod/` and `/api/clips/`, both gated by
the same `auth_request`, and have the timeline endpoint hand out URLs under those prefixes.

> Note the prefix. `/api/…` and not `/vod/…`, because the SPA owns the top-level path space —
> this is the bug that already bit `/live` once (see 11-deployment.md).

### Shape

`GET /api/cameras/{cam}/timeline?date=2026-09-03&tz=Europe/Amsterdam` resolves the local day
to a UTC range, calls the three Frigate endpoints, signs the media URLs with the existing
`MediaTokenService` under a `timeline` kind, and returns them with one shared `expires_at`.

### Files

New `CameraTimelineController`, `FrigateClient` additions, the nginx template, the HTTPRoute
is unchanged (`/api` already covers it), `TimelineView.vue` wiring.

### Verify

Open the timeline for today. The strip shows the recorded hours, dragging shows preview
frames rather than a spinner, releasing plays the recording at that moment, and the two
person events sit at 18:34 and 18:48.

---

## Not in this pass, and why

- **Push (H5)** — needs Mosquitto, the event-bridge and a `google-services.json` from a real
  Android build. That is Phase 6 and it is a different shape of work.
- **Search and date filters (H7)** — `from`, `to` and `q` are ignored by `EventController`.
  Small and worth doing, but it competes with zones for the same afternoon and zones matter
  more.
- **CI** — images are still built by hand on edwin-server. Worth building when deploys stop
  being interesting; right now every deploy has taught us something.
- **WebRTC from the browser** — cannot work over HTTPS against an `http://` LAN address, see
  11-deployment.md. Only the native app can recover it, and only with a cleartext exception.
