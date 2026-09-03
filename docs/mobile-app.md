# Mobile app

The frontend in `web/` is one Vue 3 codebase that runs both as a web app and, through
Capacitor, as a native Android app. The app is the primary target — the layouts, the feed
and the biometric unlock are all built for a phone.

It is **events-first**: a feed of things that happened, newest first, with live view and a
scrubbable timeline beside it. The month calendar that used to be the front door is now the
archive. The reasoning is in [v2/05-android-app.md](v2/05-android-app.md); how it was built
is in [v2/10-app-v2-implementation.md](v2/10-app-v2-implementation.md).

## Stack

| Piece | Used for |
|---|---|
| Vue 3 + Vite | App and build |
| Vue Router, lazily loaded routes | Routing; each route names its layout |
| Pinia (+ `pinia-plugin-persistedstate` for the archive cache) | State |
| PrimeVue + `@primeuix/themes` + PrimeIcons | UI components and the one icon set |
| hls.js | The HLS rung of the live ladder, and timeline playback |
| dayjs (`nl` locale) | Dates, everywhere, via `src/lib/datetime.js` |
| axios | API calls, token refresh, the global spinner |
| Capacitor **6** | Android wrapper, Preferences, App lifecycle, Status Bar, Haptics, Keyboard, Push, Share, Screen Orientation |
| `@aparajita/capacitor-biometric-auth` | Fingerprint / device-credential unlock |
| vitest | Tests for the parts worth testing without a device |
| FullCalendar | The archive's month view |

Capacitor stays on 6 deliberately. Moving to 7 or 8 means regenerating `web/android` and a
full native build; it is its own job, not a side effect of an app change.

## Screens

| Route | View | What it does |
|---|---|---|
| `/` | `LoginView` | Credentials, or biometric unlock when a valid token exists |
| `/events` | `EventsView` | **Home.** The feed: filters, search, infinite scroll, pull to refresh |
| `/events/:id` | `EventDetailView` | Player, tags, prev/next by swipe, share, "Dit klopt niet" |
| `/live` | `LiveView` | Live view with the fallback ladder and the rung it is on |
| `/timeline` | `TimelineView` | Day scrubber: previews while dragging, recording on release |
| `/settings` | `SettingsView` | A hub |
| `/settings/notifications` | `NotificationSettingsView` | Rules, quiet hours, snooze, test |
| `/settings/zones` | `ZonesView` | Named zones and motion masks over a camera still |
| `/settings/storage` | `StorageSettingsView` | Retention, local cache |
| `/settings/account` | `AccountSettingsView` | Re-lock delay, push status, logout |
| `/archive`, `/archive/:date` | `CalendarView`, `CalendarDayView` | The frozen v1 clips |

`/event/:id`, `/livestream`, `/calendar` and `/calendar/:date` redirect to their new homes,
so a bookmark or an in-flight notification never lands on a blank screen.

## Running it without a backend

The app has two API implementations behind one interface, selected by `VITE_API_MODE`:

```bash
cd web
npm install
npm run dev:mock     # no backend, no cluster, no Pi
```

Mock mode accepts any credentials and generates a week of events — daylight-weighted,
mostly people and cars, cars on the street and people on the path, with Dutch descriptions
and a sample clip. It is seeded, so the same feed comes back on every reload.

**Settings → Mock** exposes latency, a failure rate, an offline switch, the media TTL and
which live rungs should fail. Those are what make the loading states, the stale-feed banner,
signed-URL expiry and the ladder's descent reviewable on purpose instead of by luck.

`npm run dev` uses the real API at `VITE_API_BASE_URL`.

## Session rules

The app is stricter than the API. `router.beforeEach` requires **three** things:

| Flag | Set when | Cleared when |
|---|---|---|
| valid `authToken` | Login or refresh; expiry read from the token's own `exp` claim | Expiry passes |
| `biometricVerified` | Successful login or biometric unlock | App terminates, or **N minutes in the background** |
| `isAppActive` | Successful login or biometric unlock | App terminates |

A cold start always lands on the login screen even when the token is valid — you unlock with
a fingerprint instead of retyping the password.

**Re-locking** is new. Backgrounding records the time; returning after
`VITE_RELOCK_MINUTES` (default 5, changeable in Settings → Account) clears only
`biometricVerified`. That is a re-lock rather than a cold start, so the user gets the
fingerprint prompt and lands back on the route they left.

Tokens live in Capacitor `Preferences`, not `localStorage`, so on Android they are in native
storage rather than the WebView.

### Token refresh

`src/plugins/axios.js` attaches the bearer token and handles 401s. One shared refresh
promise serves every request that hits a 401 at the same time, and every one of them sees
the same outcome. A refresh that fails ends the session cleanly rather than leaving requests
queued behind it, and the refresh call itself goes through an interceptor-free client so it
can never re-enter its own 401 handler.

## Caching

Two separate things, deliberately:

- **The feed** keeps its first page in Preferences with a timestamp. Losing the network
  shows those events behind a "Verouderd · 3 uur geleden" banner instead of an error. New
  events found by the 30-second poll are parked behind a pill rather than spliced in above
  what you are reading.
- **The archive** keeps `stores/video.js` exactly as it was: per-day and per-hour listings
  with freshness heuristics and a `since` parameter.

**Settings → Opslag** clears both.

## Building the Android app

Requirements: Node 22, Android Studio, JDK 17.

```bash
cd web
npm install
npm run cap:sync       # build, cap sync android, then patch the native project
npx cap open android
```

`npm run cap:sync` runs `scripts/android-postsync.mjs`, which adds the deep-link intent
filters and `POST_NOTIFICATIONS`, and wires up Firebase **only when
`android/app/google-services.json` exists** — applying the Google Services plugin without it
fails the build. Every edit is idempotent, so running it twice is safe.

`web/android` is gitignored, which is why those changes are a script rather than a paragraph
someone half-follows.

From the command line:

```bash
cd web/android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

`VITE_API_BASE_URL` is compiled into the bundle, so point it at an address the **phone** can
reach — a LAN IP or a public hostname, not `localhost` — and rerun `npm run cap:sync` after
changing it. Android blocks plain HTTP by default, which is one more reason to serve the API
over HTTPS.

### Push notifications

Registration happens after login, and again daily so a rotated token does not go unnoticed.
Tapping a notification opens `/events/<id>`; if the app is locked the route is parked and
the fingerprint prompt lands on the event rather than the feed.

Without `google-services.json` the plugin fails to initialise. That is the expected state
until the Firebase project exists — the app carries on and Settings → Account says so.

App Links (`https://motion.edwintenbrinke.nl/event/<id>`) also need
`/.well-known/assetlinks.json` on that host, or Android opens the browser instead.

### Icons and splash screens

```bash
npx @capacitor/assets generate --android
```

Source images live in `web/assets/`.

## Development against a local backend

| Running on | `VITE_API_BASE_URL` |
|---|---|
| Browser on your host | `http://localhost:7100` |
| Android emulator | `http://10.0.2.2:7100` |
| Physical phone on LAN | `http://192.168.x.x:7100` |

Because the API is on a different origin, requests rely on the bearer token rather than the
cookie, and `CORS_ALLOW_ORIGIN` on the API must allow the app's origin.

Biometric authentication needs a real device or an emulator with a fingerprint enrolled. In
a plain browser `BiometricAuth.checkBiometry()` reports unavailable and the app falls back
to username and password.

## Tests

```bash
cd web
npm test
```

They cover the things that are expensive to check by hand and easy to get subtly wrong: the
live ladder's descent (no camera or network needed), the timeline's pinch and tick maths,
deep-link parsing, the token-refresh queue, the background re-lock, the feed store's
stale-while-revalidate behaviour, and the mock generator's own pagination and filters.

There is no component test suite; the screens are checked by running them.
