# Notifications

The feature that decides whether you keep the app installed. A camera that buzzes for every
cloud is a camera you mute in week two, and a muted camera is worth nothing. Most of this
document is therefore about **not** sending notifications.

## The path

```
Frigate ──MQTT frigate/reviews──► mosquitto ──► event-bridge ──HTTP──► motion-api
                                                                          │
                                              rules: zone · label · cooldown · quiet hours
                                                                          │
                                                                     FCM ─► Android
```

Why the bridge exists: Symfony has no business holding a long-lived MQTT subscription, and
Messenger has no MQTT transport worth the trouble. A ~150-line Python container that
subscribes, filters obvious noise, and POSTs to an internal endpoint keeps both sides
boring. It is also the natural place to put a dead-letter file if the API is down during a
deploy.

## What triggers a notification

Frigate 0.14+ groups tracked objects into **review items** with two severities:

| Severity | Meaning | Notify? |
|---|---|---|
| `alert` | An object of interest in a zone you care about (by default person/car) | **Yes** |
| `detection` | Everything else that was tracked and recorded | No — visible in the app, silent |

Subscribe the bridge to `frigate/reviews` and ignore `frigate/events` for notification
purposes. Events are per-object and chatty; review items are per-*incident* and are what a
human would call "something happened". This distinction alone removes most of the noise.

## The rules engine

Owned by Symfony, stored in MySQL, editable from the app. Evaluated in order; first match
wins; default is silence.

```
rule := when {camera, zone, labels[], sub_labels[], time_window, severity}
        then {notify | silent | priority}
        with {cooldown_seconds, sound, image}
```

The set worth shipping on day one:

| # | When | Then |
|---|---|---|
| 1 | `sub_label = bewoner` or a recognised face | **silent** — it is you |
| 2 | zone `pad`, label `person`, 23:00–06:00 | notify, **high** priority, 30 s cooldown |
| 3 | zone `pad`, label `person`, any time | notify, normal, 90 s cooldown |
| 4 | zone `pad`, `pakket aanwezig` state change | notify, normal, "Er is iets bezorgd" |
| 5 | zone `straat`, any label | **silent** — recorded, searchable, never buzzes |
| 6 | anything else | silent |

### The four mechanisms that keep it quiet

1. **Cooldown per (camera, zone, label).** The postman walking back and forth is one
   notification, not five. 60–120 s is the useful range.
2. **Quiet hours and snooze.** A "snooze 1 h / until tomorrow" button in the notification
   itself and in the app. This is the single most-used feature of any camera app.
3. **Known-entity suppression.** Recognised face, recognised plate, or a `bewoner`
   sub-label → never notify. Requires layer 3 from
   [03-detection-and-ai.md](03-detection-and-ai.md#layer-3--custom-classification-a-weekend-very-effective).
4. **Severity, not just on/off.** High-priority alerts bypass Do Not Disturb on Android;
   normal ones do not. Getting this wrong in either direction is what makes people uninstall.

### What a notification says

```
Title:  Persoon bij de voordeur
Body:   Bezorger zet een pakket neer · 14:32
Image:  the event snapshot
Tap:    motiondetection://event/1738d2c1-...   → the clip, already playing
Actions: [Bekijk]  [Sluimer 1 uur]
```

The body comes from the GenAI description when it has arrived, and from the deterministic
rule label when it has not. Never wait for the LLM: send the notification on the review
item, and — if you want the polish — send a silent data-only FCM message a few seconds later
that updates the same notification with the description. Android supports this via a stable
notification tag; it is a nice touch and entirely optional.

**The image is the part people underestimate.** A notification with a thumbnail is glanceable
and a notification without one is an interruption. Which is why the delivery mechanism has to
be able to fetch it — see below.

## Choosing a delivery mechanism

| Option | Works when app is killed | Image | Actions | Local-only | Effort |
|---|---|---|---|---|---|
| **FCM** (recommended) | yes | yes | yes | no — via Google | small; Capacitor plugin |
| ntfy self-hosted | yes, with the ntfy app or UnifiedPush | yes | yes | **yes** | small, but a second app |
| Frigate's own web push (VAPID) | in the PWA only | Chrome only | no | yes | zero |
| MQTT from the app | **no** — Android kills the socket | — | — | yes | don't |

**Recommendation: FCM**, for one blunt reason — it is the only mechanism that reliably wakes
a killed Android app, and Firebase is already in the homelab for Space Crucible so the
account and the tooling exist. The cost is that Google sees notification metadata (a title, a
body, and a URL). It does not see your video. If that trade is unacceptable, ntfy with
UnifiedPush is a genuinely good local alternative and the rules engine does not change —
only the transport does. Keep the sender behind an interface so swapping is a class, not a
project. Reasoning: [adr/0007-fcm-for-push.md](adr/0007-fcm-for-push.md).

Frigate's built-in web push is worth enabling anyway: it costs nothing and gives you working
notifications in a desktop browser before the Android work is done.

### The snapshot URL problem

Android fetches the notification image **itself**, from a separate process, with no access to
the app's JWT. So the URL in the FCM payload must be fetchable without a session.

Do not make snapshots public. Instead the BFF issues a **signed, short-lived media URL**:

```
https://motion.edwintenbrinke.nl/media/snap/<event-id>?exp=1756800000&sig=<hmac-sha256>
```

- HMAC over `event-id|exp` with a server-side key, 10-minute TTL, single resource
- Reachable through the same Cloudflare Tunnel as the rest of the app — the signature and
  short TTL are what limits exposure here, not network placement (see
  [adr/0004](adr/0004-tailscale-for-remote.md)); keep the TTL tight for exactly this reason
- The same mechanism serves `<video src>` in the WebView, which has the identical problem

This is described once, in [07-api-and-data-model.md](07-api-and-data-model.md#media-tokens),
and used by both notifications and playback.

## Device registration

```
POST /api/devices   { token, platform: "android", app_version }
```

Called after login and on every FCM token refresh. Store `user`, `token`, `platform`,
`last_seen`, `notifications_enabled`. Prune tokens that FCM reports as
`UNREGISTERED` — stale tokens are the usual cause of "notifications stopped working" bug
reports that turn out to be a reinstalled app.

## Failure modes to design for now

| Failure | Symptom | Mitigation |
|---|---|---|
| API down during deploy | Events silently lost | Bridge buffers to disk, replays on reconnect |
| Mosquitto restarts | Missed events | Persistent session + QoS 1; Frigate reconnects |
| FCM token expired | One device stops getting push | Prune on `UNREGISTERED`; app re-registers on launch |
| Notification storm (mask missing) | 40 buzzes in an hour | Global rate limit: hard cap of N/hour per camera, then a single "veel activiteit" summary |
| Phone has no internet at all | Notification arrives late or not at all | Push carries the thumbnail so the notification itself is still useful; the app shows a clear offline state instead of a spinner |

The global rate limit is not optional. Every camera system eventually has a night where a
spider builds a web on the lens, and the cap is what stops that from being a night without
sleep.

## Testing

Do not test this by waiting for a delivery driver.

```bash
# Replay a recorded review item through the bridge
mosquitto_pub -h mosquitto -t frigate/reviews -f fixtures/review-alert-person.json

# Or drive the API directly
curl -XPOST localhost/api/internal/events -H "X-Bridge-Secret: …" -d @fixtures/review.json
```

Keep a folder of fixture payloads: person-in-zone, car-passing, delivery, night, and a
storm of 50 in a minute. The last one is the one that finds the bugs.
