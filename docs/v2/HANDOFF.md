# Handoff — what's blocked on you

Running list. Anything here I skip and log, rather than guess or work around. Everything
*not* on this list, I execute and commit myself while you're away.

**Status key:** ⬜ not started · 🔶 prepared, waiting on you · ✅ done

## Needs your credentials or accounts

| # | What | Why I can't do it | What you do when you're back |
|---|---|---|---|
| 1 | ⬜ Firebase project for FCM | Needs your Google account, browser, 2FA | Create a Firebase project → Cloud Messaging → download `google-services.json` → drop it at `web/android/app/google-services.json` (not in git — see `.gitignore`) |
| 2 | ⬜ `MEDIA_SIGNING_KEY` secret | Fine for me to generate, but it needs to go into SOPS which needs your `age.key` | I'll generate the value and leave it in `docs/v2/HANDOFF.md` § secrets below, or a local file — you run `sops -e` |
| 3 | ⬜ Frigate/Mosquitto SOPS secrets | Same — needs `age.key` from `homelab-cluster/age.key` | Same as above |
| 4 | ⬜ NFS export on edwin-server | Needs sudo on `edwin-server` (192.168.1.253), a box I have no access to | Run the `/etc/exports` change in `docs/v2/06-kubernetes.md` yourself, or tell me if I should have SSH access to it too |
| 5 | ⬜ Android build of the new app | Needs Android Studio and a device; I can build the web bundle but not the APK | `cd web && npm install && npm run cap:sync && npx cap open android`. The sync script patches the native project for deep links and push. Drop `google-services.json` into `web/android/app/` first if you want push to work; without it the app still runs and says so in Settings → Account |

## Needs a deliberate, awake decision from you (not a credentials problem)

These are things I will **prepare but not execute**, because they're hard to reverse or
outward-facing and "let it run overnight" isn't the same as "go ahead and do this specific
irreversible thing":

| # | What | Why it waits for you |
|---|---|---|
| 6 | 🔶 Start MediaMTX on the Pi | `python/deploy/install.sh` is ready — installs and enables the service but does not start it. Nothing is currently running on the Pi (confirmed by you), so there's no conflicting process to stop this time; still flagging it since it's the first thing that actually runs on real hardware. Run it with `ssh rpi` + `./install.sh`, or tell me to go ahead |
| 7 | ⬜ Pushing `kubernetes/apps/motion/*` to `homelab-cluster` main | Flux auto-applies on push. I'll build it on a branch and open it for your review first — not merge it myself |
| 8 | ⬜ GPU node re-provisioning (Phase 3) | Takes down `space-crucible-prod`. Explicitly scheduled as its own maintenance window in the roadmap, not attempted here regardless of time available |
| 9 | ⬜ Creating the `motion.edwintenbrinke.nl` DNS/HTTPRoute | Cheap and safe, but it's the first real "this is now reachable" step — flagging it rather than silently making something newly reachable while you're asleep |

## What I'm doing instead, tonight

Everything that's pure repo work with no real-world side effect until someone applies it:

- ✅ Pi-side: MediaMTX config, systemd unit, install script, README (files only — not run
  on the actual Pi; that is item 6 above)
- ✅ Legacy Python agent moved to `python/legacy/`, Dockerfile/compose updated to match
- ✅ `event-bridge`: MQTT→HTTP service with buffering/replay, unit-tested (7/7 passing,
  no MQTT broker or live API needed — see `python/bridge/README.md`), fixtures for manual
  testing once Frigate exists
- ✅ `homelab-cluster`: the `kubernetes/apps/motion/` manifests, on branch
  `motion-namespace-skeleton` (not merged to main, not pushed — Flux only applies main).
  All 7 sub-kustomizations validated with `kubectl kustomize` (builds clean). Frigate is
  CPU-only (no GPU dependency), config seeds onto the PVC via initContainer per ADR 0005.
  motion-api/motion-web are explicit drafts — no image exists for them yet, that's the
  next item below.
- ✅ API: `Event`/`Device`/`NotificationRule` entities + migration, verified **end-to-end**
  against the real dev stack (not just linted) — migration applies and rolls back cleanly,
  DI container compiles, and a full HTTP round-trip works: bridge ingest with the shared
  secret (upserts correctly on redelivery), the app-facing feed/detail/unread-count/seen/
  feedback endpoints, and device register/unregister with token-refresh upsert and
  ownership checks. `MediaTokenService` (the media-URL signer) is written and verified via
  `api/bin/verify-media-token.php` — PHPUnit isn't set up in this project and adding it
  tonight hit a real dependency conflict (see below), so this is a standalone check instead
  of a proper test suite. `NotificationRuleMatcher` (the matching engine — first
  matching enabled rule wins, silent by default) is now written too, verified against
  the exact worked example in docs/v2/04-notifications.md via
  `api/bin/verify-notification-matcher.php` (12 checks, including the midnight-wrap
  time window). **Not yet wired into anything** — nothing calls it from the ingest
  path, and there's no endpoint to manage rules from the app yet.
- ✅ **App v2 built** (steps 1-10 of
  [10-app-v2-implementation.md](10-app-v2-implementation.md)). Events-first: feed, event
  detail with a real player, live view with the fallback ladder, timeline scrubber, four
  settings screens, push and deep links. Runs today with **no backend at all** via
  `npm run dev:mock`, and re-points at motion-api by changing one env var.

  Verified by running it, not by assuming: every screen was driven in a 375x812 browser and
  the awkward paths were exercised deliberately — the live ladder descending rung by rung,
  a signed URL expiring mid-scroll, the network dropping with content on screen, a deep link
  arriving while the app is locked. 167 unit tests, clean `npm run build`.

  Three real defects in existing code were found and fixed on the way (see the step 2
  commit): a failed token refresh wedged every later request permanently, the app logged you
  out 60 minutes after login regardless of refreshes, and the loading spinner raced itself.

  What it needs from you is below; what it needs from motion-api is in § "App v2 needs these
  from motion-api".
- ✅ App: API-client layer (`src/api/eventsApi.js`, `devicesApi.js`), the events store
  (`src/stores/events.js`, cursor-paginated, not persisted), `EventCard.vue` +
  `EventsView.vue`, wired to `/events` behind the same `VITE_TEST_BUTTON` gate as the
  existing `/test` route. Verified with a real `npm run build` (clean, no new
  warnings) and the dev server (transforms without error) — not just written and
  assumed. Not built: the event detail view (player, feedback button) and real
  thumbnails, which need `MediaTokenService` exposed by an endpoint first.

## Second review pass (2026-09-03)

Re-reviewed the previous night's code rather than trusting it. **Five real defects**, all
reproduced before fixing and re-verified after:

| # | Defect | Impact |
|---|---|---|
| 1 | Doctrine stores naive datetimes; ISO timestamps with an offset were shifted by the UTC offset | **Data corruption** — every event two hours off. Visible in the earlier test output and missed |
| 2 | Zone filter ran in PHP after SQL's `LIMIT`, so pagination stopped early | Feed silently truncated — 1 of 10 matching events returned |
| 3 | Tampered/stale cursor threw out of the repository | HTTP 500 on client-supplied input |
| 4 | `?zones=pad` without `[]` | HTTP 400 on a reasonable request |
| 5 | Partial enrichment payload overwrote `zones`/`sub_label` | The GenAI step this endpoint exists to accept would have wiped them |

Plus one hardening fix: a truncated line in event-bridge's replay buffer (process killed
mid-write) permanently jammed the buffer, losing every event behind it.

Worth noting for next time: all five got past a green smoke test. Single-row happy-path
checks confirmed the code *ran*; they could not show that pagination truncates or that a
timezone shifted. The regression suite now covers each of them explicitly.

## A decision I did not make for you

**Adding PHPUnit to `api/` hit a real dependency conflict** (`phpunit/phpunit` wants
`sebastian/diff ^6`, the pinned `phpstan`/`php-cs-fixer` versions want it fixed to `9.0.1`;
resolving needs `-W`, i.e. letting composer upgrade/downgrade across the existing
dev-tooling graph). Composer reverted cleanly, nothing is broken, but I didn't force it
through unattended. If you want real PHPUnit in this project, that's a `composer update -W`
you should run and review yourself — I left `api/bin/verify-media-token.php` as a stand-in.

I'll commit each piece as it's done so nothing is lost if the session ends mid-task, and
update this file's status column as I go.

## App v2 needs these from motion-api

The app is being built in full against a mock adapter (see
[10-app-v2-implementation.md](10-app-v2-implementation.md)) because the cluster, Frigate and
the Pi are unreachable right now. Everything below is a contract the **app already codes
against** and the API does not serve yet. None of it blocks the app; all of it blocks
`VITE_API_MODE=bff` being useful.

| # | What is missing | Where the app assumes it |
|---|---|---|
| H1 | `media { thumbnail, snapshot, clip, expires_at }` inline on `EventOutputDTO`, all three signed with the same `$now`, plus the `/media/{kind}/{id}?exp&sig` controller that verifies them. `MediaTokenService` is written and **nothing calls it** | Feed thumbnails, detail player, notification images |
| H2 | `GET /api/cameras` → `[{ name, display_name, width, height, retention }]` | Camera tabs, zone editor, storage screen |
| H3 | `GET /api/cameras/{cam}/live` → ordered `rungs[]` (webrtc/mse/hls/snapshot). Token in the query string, not a header — a WebSocket and an `<img>` cannot set one. WebRTC rung points at the LAN go2rtc service, not the tunnel | The live fallback ladder |
| H4 | `GET /api/cameras/{cam}/timeline?date&tz` → `{recordings[{start,end,vod_url}], previews[{start,end,preview_url}], events[], expires_at}`. HLS segments must be served under the same signed prefix as their playlist | The timeline scrubber |
| H5 | FCM payload shape: `data {event_id, camera, url}` + `notification {title, body, image}` with a signed snapshot URL | Notification tap → deep link |
| H6 | `/.well-known/assetlinks.json` on `motion.edwintenbrinke.nl` | App Links; without it a tapped link opens the browser |
| H7 | `from`, `to`, `q` on `GET /api/events` — in the docs, ignored by `EventController::list()` | Date-range filter and the search box |
| H8 | **Contract clash.** The endpoint validates `{feedback: string}`; 07 specifies `{correct, should_be}`. The app currently packs JSON into the string. Pick one | "Dit klopt niet" |
| H9 | Zones, masks, notification rules, snooze, test — as written in 07. `NotificationRuleMatcher` exists with nothing HTTP-facing reaching it | Zones and notification settings |
| H10 | **Bug, not a gap.** `DeviceInputDTO` silently loses `app_version`: the serializer's snake→camel converter looks for `appVersion`, which the DTO has neither as a property nor a setter, so it lands as `null` — and overwrites the stored value on re-registration | Device registration |

## Secrets generated tonight (fill into SOPS yourself)

*(populated as I generate them — check back here)*
