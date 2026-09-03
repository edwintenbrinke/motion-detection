# The Android app

What changes in `web/`. The stack stays: Vue 3, Vite, PrimeVue, Pinia, Capacitor 7,
biometric unlock. The navigation model does not.

## The shift: from calendar-first to events-first

Today the app is organised around a month calendar → a day → hours → clips. That is a
filing cabinet. A Ring camera is organised around **a feed of things that happened**, newest
first, with a scrubbable timeline behind it. The calendar becomes a filter, not the front
door.

```
today                              v2
─────                              ──
Login                              Login  (unchanged — biometrics stay)
  └ Calendar (month)                 └ Events        ← the home screen
      └ Day → hours → clips              ├ Live
          └ player                       ├ Timeline
Livestream (MJPEG)                       ├ Event detail → player
Settings                                 └ Settings → Zones · Notifications · Storage
  └ Image region
```

## Screens

### Events — the home screen

Infinite, cursor-paginated feed of review items. One card per incident:

```
┌────────────────────────────────────┐
│ [thumbnail]  14:32  Voordeur       │
│              👤 Persoon · Bezorger │
│              "Zet een pakket neer" │
└────────────────────────────────────┘
```

- Chips for label, sub-label and zone; a colour for `alert` vs `detection`
- Filter bar: date range, camera, label, zone, alerts-only
- **Search box** — free text, backed by Frigate's semantic search when layer 4 is on
- Pull to refresh; new events arrive over the existing polling or a push data message
- Unread state, so opening the app after a night shows you what you missed

This replaces `CalendarView` and `CalendarDayView` as the primary path. Keep a date picker
in the filter bar; that is the calendar's remaining job.

### Live

Full-screen WebRTC, following the ladder in
[02-video-transport.md](02-video-transport.md#hop-2--cluster--phone-pick-per-situation).

- Show the current rung (`Live · 0.3s` / `Vertraagd · 3s`), never a silent fallback
- Snapshot button, fullscreen, landscape lock
- Stop the stream on `pause`/`appStateChange` — a WebRTC session running in the background
  is battery and bandwidth for nothing. The existing Capacitor lifecycle listeners in
  `App.vue` are the right hook
- No audio: this camera has no microphone. Do not ship a mute button that does nothing

`LivestreamView.vue` keeps its route and loses its `<img>`.

### Timeline

The Ring-style scrubber, and the reason to keep continuous recording. Frigate generates
low-fps **preview** files per hour; the scrubber plays those while dragging and switches to
the real recording on release. A day of scrubbing is a few megabytes.

- Horizontal strip with event markers, tap a marker to jump
- Pinch to zoom from a day to an hour to a minute
- "Nu" button back to live

### Event detail

- Player with scrubber, ±10 s, speed control
- Prev/next event with a swipe
- All tags visible, including the GenAI description and severity
- Share / download the clip
- **"Dit klopt niet"** — the feedback button. It marks the event for review and, more
  importantly, adds its snapshot to a training set for the layer-3 classifier. A labelling
  pipeline disguised as a feature; without it, custom classification never gets good

### Zones

`ImageRegionSelector.vue` mostly survives — it already draws a normalised polygon over a
still frame. What changes:

| Today | v2 |
|---|---|
| One polygon | Multiple named zones, each with a colour |
| `POST …/placeholder-image` makes the API fetch a frame from the Pi | `GET /api/cameras/{cam}/snapshot.jpg` — a live frame from Frigate, no Pi round-trip |
| Saved to `Settings.detection_area_points` | `PUT /api/cameras/{cam}/zones` → written into Frigate config |
| — | Per-zone object filter (which labels count here) |
| — | Motion masks, drawn the same way, in a second tab |

Preserve point order when serialising: Frigate walks the polygon in the order given.

### Settings

- **Notificaties** — the rules from [04-notifications.md](04-notifications.md), quiet hours,
  snooze, per-zone toggles, test-notification button
- **Opslag** — retention per severity, current disk usage, the existing cache-clear
- **Camera** — resolution/fps presets (writes through to the Pi), day/night, IR
- **Account** — unchanged

## Technical work

| Area | Change |
|---|---|
| Live player | New `WebRtcPlayer.vue`: WHEP against the BFF, ICE config, fallback ladder, retry with backoff |
| Playback | `VideoPlayer.vue` keeps `<video>` + Range; source URLs become signed media URLs |
| Push | `@capacitor/push-notifications` + `@capacitor/local-notifications`; register token after login, re-register on refresh, handle `pushNotificationActionPerformed` → deep link |
| Deep links | `motiondetection://event/<id>` + an App Link on `motion.edwintenbrinke.nl/event/<id>` so tapping works from anywhere |
| Store | New `events` store (cursor pagination, filters, unread) replacing the day/hour cache in `stores/video.js`; keep `authentication`, `initialize`, `loading` as they are |
| API client | `axios.js` interceptors unchanged; add the media-URL signer helper |
| HTTPS | `motion.edwintenbrinke.nl` must have a valid cert — no cleartext exception. Free via the existing cluster wildcard once the HTTPRoute exists |
| Offline | The feed is the only thing worth caching; show the last known events with a stale badge rather than an error |

### Session model — deliberately unchanged

The three-flag gate (`authToken` + `biometricVerified` + `isAppActive`) and the cold-start
reset stay exactly as they are. It is one of the better parts of the current app and none of
this plan touches it. The one improvement worth making while you are in there: re-lock after
N minutes in the background — the `pause` listener currently only logs, and a camera app is
precisely the app that should re-lock.

### Permissions Android will ask for

`POST_NOTIFICATIONS` (13+), and nothing else. No camera, no location, no storage unless you
implement clip download to the gallery. Keep it that way; a camera app asking for the phone's
camera is the kind of thing that gets an APK side-eyed.

## Build

Unchanged from [../mobile-app.md](../mobile-app.md):

```bash
cd web && npm run build && npx cap sync android
```

Two new pieces of configuration:

- `google-services.json` from the Firebase project, into `web/android/app/` — **not** in git;
  keep it in SOPS alongside the cluster secrets or in the CI secret store
- `VITE_API_BASE_URL` points at `motion.edwintenbrinke.nl` — the same hostname works on the
  LAN and away from home, since it always resolves through Cloudflare either way (unlike a
  split LAN/VPN address, there is no build-time branching needed here)

## How this is being built

The screen-by-screen implementation plan, the API adapter that lets all of it run before the
backend exists, and the running progress checklist live in
[10-app-v2-implementation.md](10-app-v2-implementation.md).

## What can be built before the backend exists

The app work does not have to wait for Phase 6. Frigate's HTTP API is available as soon as
Phase 2 lands, so the events feed, the timeline and the WebRTC player can all be built
against Frigate directly and re-pointed at the BFF later — as long as the API client is a
thin layer you can swap. Build that layer first.
