# 0007 — FCM for push notifications

**Status:** proposed · **Date:** 2026-09-02

## Context

A notification has to arrive when the app is **killed**, not merely backgrounded — that is
the entire feature. On Android, waking a killed app from the network is something the OS
permits to Firebase Cloud Messaging and, via UnifiedPush, to a distributor app that holds its
own persistent connection. It does not permit it to your app's own socket.

| Option | Wakes a killed app | Image | Actions | Fully local |
|---|---|---|---|---|
| FCM | yes | yes | yes | no |
| ntfy + UnifiedPush | yes, via the ntfy app | yes | yes | **yes** |
| Frigate web push (VAPID) | in the PWA only | Chrome only | no | yes |
| MQTT from the app | no | — | — | yes |

## Decision

FCM, through `@capacitor/push-notifications`. The Firebase tooling is already in the homelab
for Space Crucible. The sender sits behind an interface in the API so the transport can be
swapped without touching the rules engine.

Frigate's own web push gets enabled too — it costs nothing and gives working notifications in
a desktop browser before any of the app work lands.

## Consequences

**Good.** Reliable delivery to a killed app, notification images, action buttons, priority
that can bypass Do Not Disturb, and a well-trodden Capacitor integration.

**Bad.** Google sees notification metadata: a title, a body, and a URL. It does not see the
video, the snapshot (the URL is signed and tailnet-only, so Google cannot fetch it either) or
anything else. For a system whose entire premise is "everything stays local", this is the one
deliberate exception, and it is worth naming rather than glossing over.

**Also.** `google-services.json` must stay out of git — SOPS or the CI secret store.

## Rejected alternative

**ntfy, self-hosted.** No Google, attachments, action buttons, UnifiedPush support, and it
would sit next to everything else in the cluster. Rejected as the default only because it
needs a second app installed and a distributor configured, which is friction on every device
forever. It is a genuinely good choice, the rules engine is unchanged either way, and if the
metadata trade above feels wrong, take this instead.
