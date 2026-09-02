# 0006 — Keep the Symfony API as a backend-for-frontend

**Status:** proposed · **Date:** 2026-09-02

## Context

Frigate has a complete HTTP API and JWT authentication since 0.14. The app could talk to it
directly, and the Symfony API — minus uploads, transcoding and retention — would have little
left to do.

## Decision

Keep it, scoped to: authentication and the biometric session model, the app-facing contract,
the notification rules engine, signed media URLs, and a searchable mirror of Frigate's
events.

## Consequences

**Good.** The three-flag session model (`authToken` + `biometricVerified` + `isAppActive`)
survives — it is one of the better parts of the current app and Frigate has no equivalent.
Notification rules, snooze and cooldown live somewhere sensible. The app has one origin, one
auth scheme, and one place where the backend can change without an APK release. The event
mirror means the feed queries MySQL instead of pointing a mobile app at Frigate's SQLite.

**Bad.** A layer that mostly forwards. Every new Frigate feature needs a passthrough before
the app can use it. Two places know what an "event" is, and they can disagree.

**Mitigation.** The BFF proxies rather than reimplements: for anything media-shaped it
forwards or redirects to a signed URL, and the mirror is an upsert of Frigate's own fields,
not a parallel model. When in doubt, forward.

## Rejected alternative

**Point the app at Frigate directly.** Genuinely simpler and a real option — Frigate's UI is
good, its API is good, and its PWA already does push. Rejected because the session model,
the notification rules and the freedom to change backends are exactly the things that make
this *your* app rather than a Frigate skin. If the BFF ever becomes pure ceremony, this is
the door out, and the app's thin API-client layer is what keeps it open.
