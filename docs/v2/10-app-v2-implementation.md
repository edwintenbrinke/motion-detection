# App v2 — the implementation plan

[05-android-app.md](05-android-app.md) says *what* the app becomes. This document says
*how*, in the order it gets built, with the contracts the app invents along the way. It
exists so the work can be picked up by a fresh session — or a different model — without
re-deriving any of it.

**Status:** in progress. The checklist in [§7](#7-progress) is the source of truth for what
is done; update it as each step lands.

## 1. The constraint that shapes this plan

The cluster, Frigate and the Pi do not exist yet, and neither do most of the endpoints in
[07-api-and-data-model.md](07-api-and-data-model.md). The app is nevertheless built **now**,
in full, against a **mock adapter** — a second implementation of one API interface that
generates plausible events, thumbnails, a sample clip and a fake live source in the browser.

```
components / views / stores
            │
            ▼
     src/api/index.js          ← the only thing that knows which world it is in
        ┌───┴────┐
     bff        mock
   (axios)   (seeded, in-memory)
```

Switching worlds is `VITE_API_MODE`. Nothing above the adapter imports axios or builds a URL,
which is the same rule `src/api/eventsApi.js` already states for the events scaffolding —
generalised to every namespace.

### Decisions taken

| Question | Answer | Why |
|---|---|---|
| Build against a mock? | **Yes**, `VITE_API_MODE=mock \| bff` | The whole app is reviewable tonight; re-pointing later is one env var |
| Capacitor version | **Stay on 6.2** | 7/8 needs `web/android` regenerated and an Android Studio build that cannot happen right now. `npx cap migrate` later, on its own |
| UI language | **Dutch**, everywhere, dayjs `nl` | The app is half English (login, settings) and half Dutch (the events scaffolding) today. docs/v2 specifies Dutch labels |
| Scope | `web/` only | Missing backend contracts get written down ([§6](#6-what-the-backend-still-owes-the-app)), not implemented |

## 2. Navigation

A bottom tab bar replaces the four-icon `AppHeader`. `CalendarLayout.vue` becomes
`AppLayout.vue`; `ImageRegionSelectorLayout.vue` becomes `FullscreenLayout.vue` (also used by
live in landscape).

```
Events · Live · Tijdlijn · Instellingen
```

| Route | View | Note |
|---|---|---|
| `/` | `LoginView` | unchanged gate, Dutch, no prefilled credentials; lands on `pendingRoute` or `/events` |
| `/events` | `EventsView` | **home** — replaces `/calendar`, which is hardcoded in the router guard, `LoginView` (twice) and `SettingsView` |
| `/events/:id` | `EventDetailView` | new |
| `/event/:id` | → `/events/:id` | the deep-link form |
| `/live` | `LiveView` | `/livestream` redirects here |
| `/timeline` | `TimelineView` | new |
| `/settings` | `SettingsView` | a hub, not a form |
| `/settings/{notifications,zones,storage,account}` | four views | new; zones is fullscreen |
| `/archive`, `/archive/:date` | `CalendarView`, `CalendarDayView` | the frozen v1 archive, reached from Settings |
| `/:pathMatch(.*)*` | → `/events` | there is no catch-all today |

Deleted: `/test` + `TestView.vue`, every `VITE_TEST_BUTTON` gate, `AppHeader.vue`,
`TableView.vue` (empty), `AppFooter.vue` and `VideoSlider.vue` (dead), the unused
`CookieHelper` import, and the `loadLayoutMiddleware` fallback to a layout
(`AppLayoutDefault.vue`) that does not exist.

### Design

Dark stays the only mode (PrimeVue Aura, `.dark-mode` on `<html>`). What changes:

- A token layer in `src/assets/main.css` — `--app-bg`, `--app-surface`, `--app-border`,
  `--app-text-muted`, `--app-alert`, `--app-detection`, spacing and radius. Every hardcoded
  hex and light-mode fallback in a component goes. The FullCalendar overrides stay; they
  belong to the archive.
- **One icon set.** FontAwesome (CSS *and* its JS bundle) is dropped in favour of PrimeIcons,
  which PrimeVue already ships.
- Skeletons instead of the full-screen overlay spinner for feed, detail and timeline. The
  overlay survives for login and saves.
- `index.html`: `lang="nl"`, a real title, the manifest linked, `viewport-fit=cover`.

## 3. Screens

### Events

Infinite scroll on an `IntersectionObserver` sentinel (the current "Meer laden" button goes),
pull-to-refresh via a small composable, day separators in Dutch, and a filter bar: alert-only
chip, camera, label, zone, a `DatePicker` range feeding `from`/`to`, and a debounced search
box feeding `q`.

The card carries a real thumbnail from a signed URL, the time, camera, chips for
label / sub-label / zones / derived tags, the GenAI title or description, an unread dot and an
alert accent. Opening it marks it seen; the unread count rides in the tab badge.

Two behaviours worth naming because they are what makes a feed feel alive:

- **Foreground polling** every 30 s, surfacing as a "3 nieuwe events" pill rather than
  shifting the list under the reader.
- **Stale-while-revalidate.** Page one is cached in Preferences with a `fetched_at`. A network
  failure shows the cached feed behind a "Verouderd · 3 uur geleden" banner instead of an
  error. This is the offline behaviour 05-android-app.md asks for.

### Event detail

`<video preload="metadata" playsinline>` against a signed clip URL, so the browser does Range
requests. The current player downloads the entire clip as a blob before playing, because a
bearer token cannot ride on `<video src>` — signed URLs are what remove that workaround.

Custom controls: play/pause, ±10 s, speed 0.5/1/1.5/2, a range scrubber, `mm:ss / mm:ss`,
fullscreen. Plus every tag, the GenAI description and severity badge, zones, score, duration,
and swipe left/right for the next and previous event in the current feed order.

**"Dit klopt niet"** offers a corrected label (persoon, auto, fiets, bezorger, bewoner,
kat/hond, vals alarm) and a free-text note. The existing endpoint takes a single string, so
the app sends a JSON string inside it until [H8](#6-what-the-backend-still-owes-the-app) is
settled.

Sharing sends the App Link, never a signed clip URL — those expire in ten minutes and a
shared dead link is worse than no share button.

### Live

The ladder from [02-video-transport.md](02-video-transport.md#hop-2--cluster--phone-pick-per-situation),
implemented as a DOM-free state machine with four interchangeable clients. Details in
[§4.2](#42-live-srcliblive). The rung is always on screen; a silent fallback is the one thing
this feature must not do.

### Timeline

A centre-playhead strip (Ring-style) over the day: hour ticks, recording ranges, event
markers. Dragging seeks inside that hour's Frigate **preview** file — a few hundred kilobytes
— and releasing plays the real recording. Pinch zooms day ↔ hour ↔ minute; "Nu" returns to
live.

### Settings

A hub, not the current five-number form. The v1 fields (`motion_threshold` and friends) are
Frigate config now and leave the UI entirely.

- **Notificaties** — the rule list and editor mapped one-to-one onto the existing
  `NotificationRule` entity (camera, zone, labels, sub-labels, time window, action, cooldown,
  enabled, priority), quiet hours, snooze, test button.
- **Zones** — `ImageRegionSelector.vue` splits into a reusable `ZoneEditor`. Its canvas,
  touch handling, normalised points and 15 px drag hit radius all survive; what is new is
  multiple named zones with colours, a per-zone object filter, and a masks tab.
- **Opslag** — retention and the existing cache clear.
- **Account** — logout, re-lock delay, push status, app version.

There is deliberately **no camera tab**. Resolution and fps write through to the Pi in
05-android-app.md, but no endpoint for it exists in 07, and shipping a settings screen that
silently does nothing is worse than not shipping it.

## 4. The technical layer

### 4.1 The API adapter (`src/api/`)

```
index.js        selectAdapter(import.meta.env.VITE_API_MODE)
contract.js     typedefs · normaliseEvent · normalisePage · normaliseLiveSource · isMediaStale
errors.js       ApiError {status, code, retryable} · NetworkError · fromAxios()
adapters/bff/   auth events media cameras live timeline zones notifications devices
adapters/mock/  db rng fixtures thumbnails latency settings timeline
```

`eventsApi.js` and `devicesApi.js` fold into `adapters/bff/`. Every call except `auth.*` and
the config PUTs passes `meta.silent`, so the feed drives its own skeletons instead of the
global spinner.

The normalised event keeps the BFF's snake_case keys — components already read them — and
adds `duration_s` and a media block:

```js
media: { thumbnail, snapshot, clip, expires_at }   // nulls when the DTO has none
```

**Media freshness.** Signed URLs live ten minutes; a scrolled feed does not. The rule is one
helper and one store action:

- `isMediaStale(media, now, margin = 60_000)` — true when `expires_at` is missing or under a
  minute away.
- `ensureFreshMedia(id, {force})` — re-fetches the event, patches `media` in place,
  coalescing concurrent calls per id.

Full-size media (the detail player, a snapshot) is checked *before* binding. Feed thumbnails
are bound directly and recover reactively: a browser cannot distinguish a 403 from a broken
image, so `@error` triggers one refresh per card, and a second failure falls back to the
severity icon. Coming back to the foreground with an expired newest event refreshes page one
rather than every card.

**The mock world.** A mulberry32 generator seeded from `VITE_MOCK_SEED` builds seven days of
events once per page load: 8–20 a day, weighted to daylight hours, a few at night; cameras
`voordeur` and `achtertuin`; the COCO labels from
[03-detection-and-ai.md](03-detection-and-ai.md#layer-1--coco-labels-free-instant-reliable),
zones `pad`/`straat`, sub-labels `bezorger`/`postbode`/`bewoner`/`onbekend`, the layer-2
derived tags, and `alert` exactly when a person or car is in `pad`. Cursors are base64
`started_at|id`, like the real one. Thumbnails and snapshots are generated SVG data URIs.

A `MockControls` panel in Settings exposes latency, failure rate, offline, media TTL and which
live rungs should fail — the knobs that make the stale banner, the `@error` recovery and the
ladder descent reviewable on purpose rather than by luck.

The one binary is `public/mock/sample-clip.mp4`. **ffmpeg is not installed on this machine**;
`scripts/make-sample-clip.mjs` fetches `ffmpeg-static` through `npx` (no permanent dependency)
and renders eight seconds of `testsrc2` at 480×270 with `-movflags +faststart`, so the clip is
progressive and Range-friendly. The script stays in the repo as the recipe.

### 4.2 Live (`src/lib/live/`)

```
ladder.js      createLadder({rungs, createClient, firstFrameTimeoutMs, stallTimeoutMs, backoffMs, onState})
labels.js      the rung strings shown in the UI
firstFrame.js  waitForFirstFrame(el) — requestVideoFrameCallback, else loadeddata + timeupdate
clients/       WhepClient · MseClient · HlsClient · SnapshotPoller · FileClient
```

Every client is the same three methods — `start(el, rung, {signal})`, `stop()`, and an emitter
for `firstFrame` / `error` / `stalled` — which is what lets the ladder be a pure state machine
with injected clients, tested under fake timers with no media at all.

| Rung | Transport | Label |
|---|---|---|
| 1 | WHEP: `RTCPeerConnection`, recvonly video, SDP `POST`, first frame on `track.onunmute` | `Live · WebRTC` |
| 2 | go2rtc MSE over WebSocket: send supported codecs, receive fMP4 into a `SourceBuffer`, seek forward when more than 2 s behind | `Live · ~1 s` |
| 3 | LL-HLS via a dynamically imported hls.js — the WebView has no native HLS | `Vertraagd · ~3 s` |
| 4 | `latest.jpg` polling with preload-swap, **sticky**: it never descends further | `Stilstaand beeld` |

No audio track is ever requested: the camera has no microphone.

Transitions: three seconds without a first frame, or an error, drops to the next rung; a
failure while playing retries the same rung three times with backoff first. `exhausted` is
only reachable if even snapshot polling fails, and auto-retries from the top after ten
seconds. The mock inserts a looping `file` rung so the whole thing is visible today.

### 4.3 Session hardening

Three real defects, all in code the app depends on every day:

| Where | Defect | Fix |
|---|---|---|
| `plugins/axios.js` | `isRefreshing` is never reset when a refresh fails, and queued subscribers are never rejected — one failed refresh wedges every later request forever | One shared `refreshPromise` cleared in `finally`; all waiters settle |
| `plugins/axios.js` | `authTokenExpiry` is not updated after a refresh, so `isTokenValid()` logs the user out 60 minutes after login no matter how many refreshes succeeded | Refresh writes the new expiry through `saveAuthToken` |
| `stores/loading.js` | A boolean, so the first of two concurrent responses hides the spinner | A counter, incremented only for non-silent requests |

The refresh itself moves to a bare axios instance with no interceptors, so it can never
recurse into its own 401 handler.

**Re-locking** is the improvement 05-android-app.md asks for. The `pause` listener only logs
today. It becomes `appStateChange` (plus `visibilitychange` in the browser): backgrounding
writes `lastActiveTime`, and returning after more than N minutes clears `biometricVerified`
and bounces to the login screen, which fingerprint-unlocks straight back to the route the user
was on. `isAppActive` stays true — this is a re-lock, not a cold start. The three-flag gate
itself is untouched.

### 4.4 Push and deep links

Capacitor 6 plugins throughout. Registration runs after both login paths and on token
refresh, then `POST /api/devices`. Without `google-services.json` the plugin simply fails,
the app carries on, and Settings → Account says *Push: niet geconfigureerd* with a retry
button — a missing Firebase project must never be a broken app.

A notification tap and an `appUrlOpen` both go through one pure `parseDeepLink`, accepting
`motiondetection://event/<id>`, `https://motion.edwintenbrinke.nl/event/<id>` and
`/event/<id>`. If the session gate is not satisfied, the route is stashed and replayed after
biometric unlock.

`web/android` is gitignored, so native changes have no home in the repo. `npm run cap:sync`
therefore runs `scripts/android-postsync.mjs`, an idempotent patcher that adds the two intent
filters and `POST_NOTIFICATIONS`, and applies the Google Services Gradle plugin **only when
`google-services.json` is actually present** — applying it without the file fails the build.

### 4.5 Dependencies

Added: `hls.js`, `@capacitor/push-notifications`, `@capacitor/share`,
`@capacitor/screen-orientation` (all Capacitor 6 lines), and `vitest` + `@vue/test-utils` +
`jsdom` as dev dependencies — the project has no tests at all today.

Removed: `@fortawesome/fontawesome-free` (PrimeIcons wins) and `@splidejs/splide` (only used
by the dead `VideoSlider.vue`).

## 5. Build order

Each step is a commit, and `npm run build` stays clean throughout.

| # | Step | Contains |
|---|---|---|
| 1 | Tooling | deps, `.env` / `.env.mock`, `dev:mock` / `test` / `cap:sync` scripts, vitest, dayjs `nl`, app version |
| 2 | Session hardening | §4.3 — small, testable, and useful against the real API today |
| 3 | API layer | §4.1 both adapters, the sample clip, `stores/events.js` moved onto it |
| 4 | Shell | tokens, `AppLayout` + tab bar, routes, redirects, icon-set swap, dead files removed |
| 5 | Events + detail | feed polish, offline cache, detail view, player rewrite, feedback, share |
| 6 | Live | §4.2, ladder tests first |
| 7 | Timeline | geometry tests first, then the strip |
| 8 | Settings | hub, notifications, zones, storage, account, mock controls |
| 9 | Push | §4.4 and the post-sync script |
| 10 | Docs | this file, `HANDOFF.md`, `mobile-app.md` |

## 6. What the backend still owes the app

Everything the app had to invent, so the API work has a list rather than an archaeology
project. Mirrored into [HANDOFF.md](HANDOFF.md).

| # | Contract |
|---|---|
| H1 | A `media { thumbnail, snapshot, clip, expires_at }` block inline on `EventOutputDTO`, all three signed with one `$now`, plus the `/media/{kind}/{id}?exp&sig` controller that verifies them. `MediaTokenService` exists and nothing calls it |
| H2 | `GET /api/cameras` → `[{ name, display_name, width, height, retention }]` |
| H3 | `GET /api/cameras/{cam}/live` → an ordered `rungs[]` (§4.2). WebSockets and `<img>` cannot set headers, so the token rides in the query; the WebRTC rung is the LAN go2rtc origin, not the tunnel |
| H4 | `GET /api/cameras/{cam}/timeline?date&tz` → `{ recordings[{start,end,vod_url}], previews[{start,end,preview_url}], events[], expires_at }`, with HLS segments served under the same signed prefix as their playlist |
| H5 | FCM payload: `data { event_id, camera, url }` and `notification { title, body, image }`, the image a signed snapshot URL |
| H6 | `/.well-known/assetlinks.json` on `motion.edwintenbrinke.nl`, or App Links open the browser instead of the app |
| H7 | `from`, `to` and `q` on `GET /api/events` — documented in 07, silently ignored by the controller |
| H8 | Feedback body: the app sends `{feedback: "<json string>"}` because that is what the endpoint validates; 07 specifies `{correct, should_be}`. Pick one |
| H9 | Zones, masks, notification rules, snooze and test endpoints, as written in 07. `NotificationRuleMatcher` exists but nothing HTTP-facing reaches it |
| H10 | **Bug:** `DeviceInputDTO` loses `app_version`. The serializer converts it to `appVersion`, for which the DTO has neither property nor setter, so it is dropped — and written back as `null` over the stored value on re-registration |

## 7. Progress

- [x] 1 · Tooling
- [x] 2 · Session hardening
- [x] 3 · API layer + mock world
- [x] 4 · Shell, navigation, design tokens
- [x] 5 · Events feed and event detail
- [x] 6 · Live player and the ladder
- [x] 7 · Timeline
- [x] 8 · Settings
- [x] 9 · Push and deep links
- [ ] 10 · Docs
