# Mobile app

The frontend in `web/` is one Vue 3 codebase that runs both as a web app and, through
Capacitor, as a native Android app. The app is the primary target — the layouts, the
calendar and the biometric unlock are all built for a phone.

## Stack

| Piece                          | Used for |
|--------------------------------|----------|
| Vue 3 + Vite                   | App and build |
| Vue Router with layout middleware | Routing; each route names its layout |
| Pinia + `pinia-plugin-persistedstate` | State, persisted to local storage |
| PrimeVue + `@primeuix/themes`  | UI components |
| FullCalendar                   | The month view |
| Splide                         | Video carousels |
| axios                          | API calls, token refresh, loading state |
| Capacitor 6                    | Android wrapper, Preferences, App lifecycle, Status Bar, Haptics, Keyboard |
| `@aparajita/capacitor-biometric-auth` | Fingerprint / device-credential unlock |

## Screens

| Route                     | View                     | What it does |
|---------------------------|--------------------------|--------------|
| `/`                       | `LoginView`              | Credentials, or biometric unlock when a valid token exists |
| `/calendar`               | `CalendarView`           | Month calendar; pick a day |
| `/calendar/:date`         | `CalendarDayView`        | Hours as collapsible blocks with clip counts, normal/important toggle, players |
| `/livestream`             | `LivestreamView`         | Live MJPEG view via `/api/video/stream-alt` |
| `/settings`               | `SettingsView`           | Thresholds, durations, disk budget, logout, clear local storage |
| `/settings/image-region`  | `ImageRegionView`        | Draw the ROI polygon over a fresh camera frame |
| `/test`                   | `TestView`               | Scratch view, gated by `VITE_TEST_BUTTON` |

## Session rules

The app is stricter than the API. `router.beforeEach` requires **three** things before it
lets you onto an authenticated route:

| Flag                 | Set when | Cleared when |
|----------------------|----------|--------------|
| valid `authToken`    | Login or refresh; expiry stored alongside it | Expiry passes |
| `biometricVerified`  | Successful login or biometric unlock | App terminates |
| `isAppActive`        | Successful login or biometric unlock | App terminates |

`App.vue` registers Capacitor lifecycle listeners and calls `resetAppState()` on launch, so
a cold start always lands on the login screen even when the token is still valid — you unlock
with a fingerprint instead of retyping the password. Minimising the app currently keeps the
session (the `pause` listener only logs); re-locking after a period in the background is on
the project's TODO list.

Tokens are stored with Capacitor `Preferences` (`authToken`, `refreshToken`,
`authTokenExpiry`, `hasLoggedInWithCredentials`), not in `localStorage`, so on Android they
live in native storage rather than the WebView.

### Token refresh

`src/plugins/axios.js` attaches the bearer token to every request and handles 401s:

1. First 401 on a request marks it `_retry` and triggers a refresh.
2. Concurrent requests are queued via `refreshSubscribers` and replayed with the new token.
3. If the refresh itself fails with *Invalid or expired refresh token*, the app clears auth
   data, calls `/api/logout`, shows a toast and returns to the login screen.

The same interceptors drive the global loading spinner.

## Caching

`stores/video.js` caches listings per day and per hour, keyed by date, hour and the
normal/important filter, and decides when to refetch:

- Today: refresh if the last fetch was more than a minute ago.
- A past hour fetched after that hour ended: never refetch.
- A past hour fetched while it was still running: refetch once.

When a refetch is needed the store passes a `since` timestamp, so the API only returns what
arrived after the last fetch. On a phone with a patchy connection that is the difference
between a snappy calendar and a spinner. **Settings → Storage** clears the cache when the
persisted state gets out of sync.

## Building the Android app

Requirements: Node 22, Android Studio, JDK 17.

```bash
cd web
npm install
npm run build          # produces dist/, the Capacitor webDir
npx cap sync android   # copies dist/ into the native project and updates plugins
npx cap open android   # opens Android Studio
```

Build and run from Android Studio, or from the command line:

```bash
cd web/android
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
```

Capacitor config (`web/capacitor.config.json`):

```json
{ "appId": "motion.detection", "appName": "motion-detection", "webDir": "dist" }
```

`VITE_API_BASE_URL` is compiled into the bundle, so point it at the address the **phone**
can reach — a LAN IP or a public hostname, not `localhost` — and rerun `npm run build` plus
`npx cap sync` after changing it.

Because the API is on a different origin than the app, requests rely on the bearer token
rather than the cookie, and `CORS_ALLOW_ORIGIN` on the API must allow the app's origin.
Android also blocks plain HTTP by default, which is one more reason to serve the API over
HTTPS.

### Icons and splash screens

`@capacitor/assets` is available as a dev dependency. Put source images in `web/assets/` and
generate the platform assets:

```bash
npx @capacitor/assets generate --android
```

App icon and display name are still on the project TODO list, so the app currently ships
with Capacitor's defaults.

## Development against a local backend

| Running on            | `VITE_API_BASE_URL`      |
|-----------------------|--------------------------|
| Browser on your host  | `http://localhost:7100`  |
| Android emulator      | `http://10.0.2.2:7100`   |
| Physical phone on LAN | `http://192.168.x.x:7100`|

Biometric authentication needs a real device or an emulator with a fingerprint enrolled. In
a plain browser `BiometricAuth.checkBiometry()` reports unavailable and the app falls back
to username and password.
