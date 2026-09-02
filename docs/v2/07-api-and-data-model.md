# API and data model

What happens to `api/`. The short version: it stops being a file server and becomes a
backend-for-frontend. Auth, the app-facing contract, notification rules and a searchable
mirror of Frigate's events — that is the whole job.

## What survives

| Kept as-is | Why |
|---|---|
| `AuthenticationController`, JWT + refresh tokens | Works, and the app's session model depends on it |
| `JwtCookieOrHeaderAuthenticator` | Header for the app, cookie for the browser |
| `User`, `RefreshToken` | Unchanged |
| `PaginationService`, `RequestResponseLogger` | Unchanged |

## What goes

| Removed | Replaced by |
|---|---|
| `POST /api/video/upload` | Frigate records directly. Delete after the archive freezes |
| `ProcessFileMessageHandler` (ffmpeg transcode + vflip) | Nothing. `vflip` happens at capture; recordings are never re-encoded |
| `FileCleanupMessageHandler` | Frigate retention |
| `GET /api/video/stream-alt` (MJPEG proxy) | WebRTC via go2rtc |
| `RaspberryApiService` | The API never talks to the Pi again |
| `Settings.motion_threshold`, `roi_motion_threshold`, `recording_extension`, `max_recording_duration`, `max_disk_usage_in_gb` | Frigate config |
| `Settings.detection_area_points` | Frigate zones (multiple, named) |
| `MotionDetectedFile` + calendar endpoints | `Event` mirror + cursor feed. Kept read-only as "Archief" |

That is roughly 800 lines of PHP and the entire Messenger async transport, gone.

## Event mirror

Frigate owns the truth in its SQLite database. The BFF keeps a **mirror** so the app can
filter, paginate and search without touching it — SQLite behind a single process is not
something to point a mobile app at.

```php
#[ORM\Entity]
class Event
{
    private string $id;                    // Frigate's event/review id (uuid-ish)
    private string $camera;
    private string $severity;              // alert | detection
    private string $label;                 // person, car, bicycle, …
    private ?string $subLabel;             // bezorger, bewoner, a name, a plate
    private array  $zones;                 // ["pad", "straat"]
    private array  $derivedTags;           // rules-engine output, layer 2
    private float  $topScore;
    private \DateTimeImmutable $startedAt;
    private ?\DateTimeImmutable $endedAt;
    private bool   $hasClip;
    private bool   $hasSnapshot;
    private ?string $title;                // GenAI
    private ?string $description;          // GenAI
    private ?string $genaiSeverity;        // normal | suspicious | dangerous
    private bool   $seen = false;          // per-user read state
    private ?string $feedback;             // "dit klopt niet" → training queue
}
```

Indexes that matter: `(camera, started_at DESC)`, `(severity, started_at DESC)`, and a
composite on `(started_at, id)` for the cursor.

Events arrive twice — once when the review item opens, once when it ends and again when
enrichment lands. Make the write an **upsert on `id`**, and never assume ordering.

```php
#[ORM\Entity] class Device { $user; $token; $platform; $appVersion; $lastSeen; $enabled; }
#[ORM\Entity] class NotificationRule { $user; $priority; $camera; $zone; $labels; $subLabels;
                                       $fromTime; $toTime; $action; $cooldownSeconds; }
```

## Endpoints

### Events

```
GET  /api/events?cursor=&limit=25&from=&to=&cameras[]=&labels[]=&zones[]=&severity=&q=
GET  /api/events/{id}
POST /api/events/{id}/seen
POST /api/events/{id}/feedback      { correct: false, should_be: "fietser" }
GET  /api/events/unread-count
```

`q` is free-text search. Pass it through to Frigate's semantic search when layer 4 is
enabled; fall back to a `LIKE` over `description` and `sub_label` when it is not.

**Cursor, not offset.** The current calendar endpoints paginate by day and hour, which was
fine for a filing cabinet and is wrong for a feed: new events arriving while you scroll shift
every offset. Encode the cursor as base64 of `started_at|id`.

### Media

```
GET /api/events/{id}/clip.mp4         → 302 to a signed media URL, or proxied with Range
GET /api/events/{id}/snapshot.jpg
GET /api/events/{id}/thumbnail.jpg
GET /api/cameras/{cam}/snapshot.jpg   → live frame, for the zone editor
GET /api/cameras/{cam}/timeline?date= → preview segments for the scrubber
GET /api/cameras/{cam}/live           → { whep_url, ice_servers, token, fallbacks[] }
```

Proxy rather than redirect where you can: one origin means one CORS policy, one auth scheme,
and the freedom to move Frigate without shipping an app update. Where the payload is large
(clips), redirect to a signed URL so PHP is not in the path of a 40 MB range request — the
[live-view memory growth](../troubleshooting.md#live-view-memory-growth) problem the current
MJPEG proxy has is exactly what happens when PHP carries media.

### Media tokens

`<video src>`, `<img src>` and Android's notification-image fetcher cannot set an
`Authorization` header. Every one of them needs a URL that authenticates itself.

```
/media/{kind}/{id}?exp={unix}&sig={hmac_sha256(kind|id|exp, MEDIA_SIGNING_KEY)}
```

- 10-minute TTL, scoped to one resource and one kind
- Verified by a lightweight controller that does no session lookup
- Reachable through the same Cloudflare Tunnel as everything else
  ([adr/0004](adr/0004-tailscale-for-remote.md)) — the short TTL and per-resource scope are
  what limits a leak here, so keep both tight rather than relaxing either for convenience
- The key lives in SOPS and rotates independently of the JWT keys

This one mechanism serves clip playback, snapshots in the app, and notification thumbnails.
Do not invent a second one.

### Cameras and zones

```
GET /api/cameras
GET /api/cameras/{cam}/zones
PUT /api/cameras/{cam}/zones          { zones: [{ name, points: [{x,y}], objects: [] }] }
GET /api/cameras/{cam}/masks
PUT /api/cameras/{cam}/masks
```

`PUT` translates the app's normalised points into Frigate's `x,y,x,y,…` coordinate string
and writes it through Frigate's config API, which triggers a reload. Validate before
writing — an invalid config makes Frigate refuse to start, and recovering means shelling
into a pod. Validate, write, poll `/api/version`, and roll back on failure.

### Devices and rules

```
POST   /api/devices          { token, platform, app_version }
DELETE /api/devices/{id}
GET    /api/notification-rules
PUT    /api/notification-rules
POST   /api/notifications/snooze   { minutes: 60 }
POST   /api/notifications/test
```

### Internal

```
POST /api/internal/events        # event-bridge only
```

Guarded by a shared secret header **and** a NetworkPolicy restricting the source pod. Not
reachable from outside the namespace. It is the one unauthenticated-by-JWT path in the
system, so it gets both belts.

## Archive

The existing `MotionDetectedFile` rows and `public/recordings/*.mp4` stay exactly where they
are, served by the existing endpoints, behind an "Archief" route in the app. Freeze the
write path, keep the read path, delete both when you stop caring. Do not import them into
Frigate: they have no events, labels or zones, and they would pollute an otherwise structured
timeline with unsearchable blobs.

## Migration order

The API can change while everything else keeps working:

1. Add `Event`, `Device`, `NotificationRule` entities + migrations. Nothing reads them yet
2. Add `POST /api/internal/events` and the read endpoints. Point them at a Frigate that is
   already running in Phase 2, so the feed can be built and tested before anything is removed
3. Switch the app to the new feed; keep the calendar routes alive behind `/archive`
4. Freeze `POST /api/video/upload`; stop the Pi's old agent
5. Delete the upload path, the message handlers, `RaspberryApiService` and the MJPEG proxy
6. Drop the dead `Settings` columns in a final migration

Steps 1–3 are reversible at any point, which is the whole reason for this ordering.
