# Open work — the plan

**All eight are implemented and verified against the running system (2026-09-04).** This
document is kept as the record of what was wrong and why, because the causes turned out to
be worth more than the fixes: most of them were things that looked correct and were not.

| # | What | Status |
|---|---|---|
| 1 | Refreshing the page logs you out | ✅ stays logged in across three reloads |
| 2 | Live view is choppy after a refresh | ✅ 5/5 refreshes, playbackRate 1, no seeking |
| 3 | Clip player shows the wrong time | ✅ real duration from the event |
| 4 | Zones and motion masks | ✅ create, read and delete, applied by Frigate |
| 5 | Timeline | ✅ 7 spans, 5 previews, 12 events, HLS through the gate |
| 6 | A few seconds of buffer around each clip | ✅ a 4 s event gives a 14.03 s clip |
| 7 | Deleting events | ✅ gone from Frigate and the app, no resurrection |
| 8 | Grafana dashboard | ✅ scraping, 4 alerts loaded, panels drawing |

## What was actually wrong

Every one of these was found by running the thing, not by reading it. Seven were invisible
failures — code that ran, returned success, and did nothing:

- The **cold-start lock** cleared a flag the browser could never restore, so a correct
  security feature became a login prompt on every refresh.
- `MseClient.stop()` set `ws.onclose = null` on handlers added with `addEventListener`, which
  removes nothing.
- `keepUp()` hard-seeked after every appended fragment; through a tunnel that is constantly.
- **No client ever emitted `stalled`**, so the ladder's entire recovery path was dead code.
- `record.*.pre_capture` looked like the clip buffer and is not — it decides which segments
  are *retained*.
- The **sync only ever inserted**, so anything deleted upstream lived in the feed forever
  pointing at media that 404s.
- **`config/set` reads every query parameter as a config key**, including `requires_restart`,
  and answers "Error parsing config" with the real reason several frames down a pydantic
  trace in Frigate's own log.
- **`config/set` cannot delete**: an empty value leaves the zone behind without its required
  field and Frigate rejects the whole request.
- **Saving a config is not applying it.** Frigate keeps serving the old one until it
  restarts, so a zone written without that reads back as absent and matches nothing.
- The **PrometheusRule had no `release` label**, so four alerts were created, looked correct
  in `kubectl get`, and were never loaded.

And one that was mine twice over: the reconcile window. Bounding a deletion check to the
span of the events that came back sounds safe and is exactly wrong — an event deleted
*before* the oldest survivor is never in range, which is the one case the check exists for.

## One thing the fixes revealed

With no zones and no masks, Frigate tracks a parked car as a **single event lasting two and
a half hours**. That is not a bug; it is what "nothing is scoped" means, and it is why §4
mattered. It also makes the padded clip for such an event useless — a 154-minute clip is not
something a player opens. Draw the zones.

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

## 6. A few seconds of buffer around each clip

### What happens

An event clip starts the instant the object is seen and ends the instant it is gone. A
3-second event gives a 3-second clip — measured: `duration=3.037267`. You never see what
happened just before, which is usually the part you wanted.

### Cause, and why the config already looks right

The config *does* set a buffer:

```
alerts:     pre=5s post=5s
detections: pre=5s post=5s
```

but `record.*.pre_capture` decides **which recording segments are kept**, not how long
`clip.mp4` is. `/api/events/<id>/clip.mp4` always returns exactly the event's own window.
The footage either side already exists on disk — it is retained, it is just not in the clip.

So this is not a Frigate setting we have got wrong. It is an endpoint choice.

### Fix

Frigate serves any time range:

```
/api/{camera}/start/{start}/end/{end}/clip.mp4
```

Verified against the same event: asking for ±5 s returned **13.03 s** of video, 4.9 MB,
containing the 3-second event in the middle.

`MediaController` already resolves `clip` to an upstream path. Change that resolution to use
the ranged endpoint with the event's `started_at`/`ended_at` and a configurable pad:

- `MEDIA_CLIP_PRE_ROLL_S` / `MEDIA_CLIP_POST_ROLL_S`, defaulting to 5, on `motion-api-secret`
  or plain env.
- Keep the padding **below** `record.*.pre_capture`, or you will ask for segments that
  retention has already deleted and get a short clip back with no error. Five and five
  matches what is retained today; if the pad goes up, that config goes up first.
- The event's `duration_s` in the app is the *event* length, not the clip length. The player
  fix in §3 must use `pre + duration + post` for the scrubber, or the timeline under the
  video will be wrong in a new way.

There is a second, larger prize here: this is the same endpoint the timeline needs (§5), so
building it once serves both.

### Files

`src/Service/FrigateClient.php`, `src/Controller/MediaController.php`,
`web/src/components/player/VideoPlayer.vue`, the HelmRelease env.

### Verify

Open an event of a few seconds. The clip runs about ten seconds longer than the event, the
person walks in rather than being already there, and the scrubber matches.

---

## 7. Deleting events

### State

Nothing in the app can delete. Frigate can: `DELETE /api/events/{id}` exists and works.

> It works rather thoroughly. I confirmed the route existed by calling it with a real id
> during this investigation, and it deleted a real event — `1788460474.723833-5q5tpf`, the
> 18:34 person — clip, snapshot and all. That is the correct behaviour and the wrong way to
> have tested it. Recorded here because the same trap is waiting for whoever implements this:
> **test destructive endpoints against an event you created for the purpose.**

### The part that is not obvious

Deleting has to happen in two places, and the sync currently makes that worse. Confirmed
during the same investigation: the deleted event is gone from Frigate and **still in the
app's MySQL**, because `app:frigate:sync-events` only inserts and updates. It has no concept
of removal, so anything deleted upstream lives on in the feed forever, pointing at media that
returns 404.

That bug exists today, independently of this feature.

### Fix

Three parts:

1. **`DELETE /api/events/{id}` on motion-api.** Deletes upstream in Frigate first, and only
   removes the local row if Frigate agreed — the other order leaves the feed lying about what
   exists. Return 404 for an unknown id, 502 if Frigate refuses.
2. **Reconcile deletions in the sync.** For the window it just fetched, any local event in
   that time range that Frigate no longer has is gone: delete it. Bounded to the fetched
   window so a Frigate outage cannot empty the table.
3. **The app.** A delete action on the event detail with a confirmation, and an optimistic
   removal from the feed store. `EventsView` already has a store to remove from.

Consider soft-delete locally (a `deleted_at` column) rather than a hard row delete, so an
accidental tap is recoverable for a day even though the media is not. The media is gone
either way — that is Frigate's call and it is immediate.

### Files

`src/Controller/EventController.php`, `src/Command/SyncFrigateEventsCommand.php`,
`src/Service/FrigateClient.php`, `web/src/api/adapters/bff/events.js`,
`web/src/views/EventDetailView.vue`, a migration if soft-delete wins.

### Verify

Delete an event in the app. It leaves the feed, `curl /api/events` on Frigate no longer has
it, the next sync does not resurrect it, and its media URL 404s.

---

## 8. Grafana dashboard

### What exists already

More than expected. Frigate exposes Prometheus metrics at **`/api/metrics`** — confirmed
serving — and the cluster already runs kube-prometheus-stack with Grafana. So this is
wiring, not building.

Metrics worth a panel, all present with real values right now:

| Metric | Now |
|---|---|
| `frigate_storage_used_bytes` / `_total_bytes` / `_free_bytes` | per mount, tagged `nfs4` vs `tmpfs` |
| `frigate_camera_fps`, `frigate_process_fps`, `frigate_skipped_fps` | 5.0 / 5.0 / 0.0 |
| `frigate_detection_fps` | 0.2 |
| `frigate_detector_inference_speed_seconds` | 0.00821 — the GPU, in one number |
| `frigate_gpu_usage_percent`, `frigate_gpu_mem_usage_percent` | the 1080 Ti |
| `frigate_camera_events_total` | events since the exporter started |
| `frigate_device_temperature`, `frigate_service_uptime_seconds` | |
| `frigate_cpu_usage_percent`, `frigate_mem_usage_percent` | per process |

### What is missing and has to come from us

Frigate counts events since *its own* start, and knows nothing about clip counts or growth
over time. The interesting questions — "how many clips do I have", "how fast is the disk
filling", "is retention actually holding" — need the app's own data:

- A small `/metrics` on motion-api (or a recording rule) exposing `motion_events_total` by
  camera, label and severity from the events table, plus the storage the recordings
  directory actually occupies.
- Growth per day is then a Prometheus `rate()` over storage-used, which is the panel that
  answers "will 3 days of continuous still fit next month".

### The retention panel is the one that matters

Storage used against the retention budget, with the 115 GB figure from
[06-kubernetes.md](06-kubernetes.md#retention-budget) drawn as a threshold. The done-criteria
for Phase 2 include "the recordings volume grows and then *stops* growing after 72 h" — that
is a graph, and nobody is going to watch `du` for three days to see it.

### Alerts worth having, from the same data

Straight from [06-kubernetes.md](06-kubernetes.md#observability), and they are cheap now:

- **camera offline > 2 min** — `frigate_camera_fps == 0`
- **no events for 12 h** — a dead camera and a quiet day look identical in a graph, and this
  is the alert that tells them apart
- **recordings volume > 90 %**
- **detection fps below target**, which catches a GPU that has quietly fallen back to CPU

### Fix

1. A `ServiceMonitor` for Frigate against `/api/metrics` in
   `kubernetes/apps/motion/frigate/app/`.
2. A dashboard as a ConfigMap with the Grafana sidecar label, next to the existing host
   dashboards.
3. `PrometheusRule` for the four alerts.
4. Optionally, the motion-api metrics endpoint for clip counts and per-label totals.

Steps 1–3 stand alone and are worth doing first; step 4 is the one that needs app code.

### Files

`kubernetes/apps/motion/frigate/app/servicemonitor.yaml`, a dashboard ConfigMap,
`prometheusrule.yaml`, and `docs/motion-detection.md` in the homelab repo.

### Verify

Grafana shows the panels with real numbers. Then pull the Pi's power for three minutes and
watch the camera-offline alert fire — the one alert whose whole job is to notice exactly
that.

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
