# The timeline page, and the clip player

Two things are broken in the app and they are broken for unrelated reasons, so this
document keeps them apart:

- **The Tijdlijn page does nothing but live.** Dragging back moves the playhead label and
  draws nothing; letting go says "Geen opname op dit moment"; the marker list under the
  strip is always empty.
- **The clip player on an event cannot seek.** Play works, the progress bar does not, and
  neither does ±10 s or the speed button once you are past what has buffered.

Neither is a missing feature. Both are code that runs, returns success, and does nothing —
the same failure mode as everything in [12-open-work.md](12-open-work.md), which is why
§5 there is ticked. It was verified with `curl` against the API, and the API is fine. The
break is on the other side of the wire in one case and underneath it in the other.

| # | What | Where | Verdict |
|---|---|---|---|
| A1 | The timeline API sends unix seconds, the app parses ISO strings. Everything is `NaN` | `CameraTimelineController` ↔ `web/src/api/adapters/bff/timeline.js` | **The whole page.** Fix first |
| A2 | HLS segment URLs lose the signature, and the cookie fallback cannot work cross-origin | `TimelineMediaController` | Playback 403s even after A1 |
| A3 | Every drag remounts the preview and every pointermove issues a seek that the previous one is still doing | `TimelinePreview.vue` | Black frames, frozen scrub |
| A4 | Smaller: dead `scrub` emit, hard-coded camera, native `<video controls>` in one player and a custom skin in the other | `TimelineView.vue`, `RecordingPlayer.vue` | Polish, after A1–A3 |
| B1 | Frigate builds `clip.mp4` on the fly: no `Content-Length`, no `Range`, no duration. A browser cannot seek in it | `FrigateClient::eventMediaPath()` + Frigate | **The whole player.** Not fixable in the frontend |
| B2 | `seekTo()` writes `currentTime` without ever consulting `video.seekable` | `VideoPlayer.vue` | Why it fails silently instead of visibly |
| B3 | The scrub bar's `max` is `knownDuration`, which is longer than anything the media can seek to | `VideoPlayer.vue` | The bar lies about its own range |

The short version: **A1 is a one-line class of bug with a one-file fix, B1 needs a different
upstream endpoint.** Everything else is downstream of those two.

> **Status (2026-09-05).** All six steps are **implemented**.
> What that means in practice is at the bottom, under [Order of work](#order-of-work).
> A1 is verified end to end: with the mock rewritten to emit unix seconds -- the exact shape
> that used to empty the page -- the strip draws its spans and its gap, dragging back to
> 12:19:57 finds the recording under the playhead and plays it. A2 is verified as far as it
> can be from here: the playlist rewrite is exercised against a master and a media playlist,
> including `URI="..."` attributes. It has not been run against the real Frigate. A3 is
> verified in the browser — one seek for 41 pointermoves, the same `<video>` element across
> two gestures, the blank state where there is no preview file. B1's wiring is verified on
> both fallback paths; its success path needs a real playlist and has not been run. B2/B3
> are verified: asking the bar for second 60 of a clip whose media stops at 8 lands the
> playhead at 7.75 and the clock says so, rather than the UI claiming 60. A4's merge is
> verified in the browser — one player component now serves both screens, it pauses when the
> timeline hides it, and the camera chips switch the day.
>
> **Deliberately not done:** the `mode`/`date` pair in `TimelineView` is still two pieces of
> state that can disagree; §A4 argues for one `viewState` and that refactor has not been
> attempted. `MediaController::get()` also still sets `X-Accel-Buffering: no` on segment
> responses, where it is pointless (§B1).
>
> **Nothing here has run against the real Frigate or the real API.** Everything below that
> says "verified" means verified against the mock adapter in a browser, or by unit test.

---

## Part A — the timeline

### A1. Unix seconds versus ISO strings

`CameraTimelineController` returns times as numbers:

```php
'start' => (int) floor($span['start']),          // 1757000000
'end'   => (int) ceil($span['end']),
```

```php
'start' => (float) ($preview['start'] ?? 0),      // 1757000000.0
'start' => $event->getStartedAt()->getTimestamp(),
```

and the app parses them as strings, everywhere, without exception:

```js
// TimelineStrip.vue
const x1 = timeToX(Date.parse(range.start), view());
// useTimelineGeometry.js
export function rangeAt(ts, ranges) {
    return ranges.find((range) => ts >= Date.parse(range.start) && ...) ?? null;
}
```

`Date.parse(1757000000)` coerces the number to `"1757000000"`, which is not a date in any
format the spec or V8 recognises. It is `NaN`. And `NaN` is not an error — it is a number
that makes every comparison false and every drawing coordinate invisible:

- `timeToX()` returns `NaN`, so `fillRect()` draws nothing. The recording track is empty
  and the whole day reads as a gap.
- `rangeAt()` finds nothing, so `currentRange` is `null` → **"Geen opname op dit moment"**,
  which is exactly what you see, and it is the truthful rendering of a broken parse.
- `onScrubEnd()` returns early before ever calling `recording.play()`, so no video is ever
  requested. Nothing 404s, nothing errors, the network tab is quiet.
- `nearbyEvents` filters on `Math.abs(NaN - centerTs) <= half` → false for every event, so
  the tappable marker list under the strip is always empty even on a day with events.
- `formatTime(event.start)` gives dayjs a bare number, which it reads as **milliseconds**
  since the epoch — 1757000000 ms is 21 January 1970. Not `NaN`, just wrong, which is why
  markers would have shown a nonsense time rather than "Invalid Date" if any had rendered.

Everything the strip draws is derived from those three arrays, so a single unit mismatch
takes the entire page out while leaving live — which never touches this data — working.

**Why nothing caught it.** The mock adapter emits ISO strings:

```js
// api/adapters/mock/timeline.js
recordings.push({ start: new Date(start).toISOString(), ... });
```

and `useTimelineGeometry.test.js` was written against the mock:

```js
{ start: '2026-09-03T00:00:00Z', end: '2026-09-03T03:00:00Z', vod_url: 'a' },
```

So `npm run dev:mock` shows a working timeline, `npm test` is green, and the only broken
configuration is the real one. The tests encode the mock's contract, not the API's — which
is the actual defect, and the reason the fix below has to touch the tests as well.

**Why it was allowed to happen.** HANDOFF H4 specifies the shape and not the units:

> `{recordings[{start,end,vod_url}], previews[{start,end,preview_url}], events[], expires_at}`

Two people read that and picked differently. Every *other* endpoint in the API serialises
times as ATOM (`EventOutputDTO`, `expires_at` in this very response), so the timeline
endpoint is the odd one out and it is the side that should move.

#### Fix

Three parts. The first alone makes the page work; the other two are what stop it from
happening again.

**1. The API speaks ATOM, like the rest of the API.** In `CameraTimelineController`:

```php
private function iso(float $unix): string
{
    return (new \DateTimeImmutable('@' . (int) round($unix)))
        ->setTimezone(new \DateTimeZone('UTC'))
        ->format(\DateTimeInterface::ATOM);
}
```

applied to `groupRecordings()` (`start`, `end`), `mapPreviews()` (`start`, `end`) and
`eventsBetween()` (`start`, `end` — `end` stays nullable). The `vod_url` path keeps its
unix seconds: that is Frigate's URL format, not our contract.

**2. Normalise on the way in anyway.** The timeline adapter is the only endpoint in
`api/adapters/bff/` with no normaliser — `events`, `live` and the rest all go through
`contract.js`. Add one, and make it accept both shapes so the app survives an API that has
not been redeployed yet:

```js
// api/contract.js
export function asEpochMs(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        // Unix seconds. Anything under ~1e11 cannot be a sane millisecond timestamp
        // (1e11 ms is 1973); anything over it already is one.
        return value < 1e11 ? value * 1000 : value;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

export function normaliseTimelineDay(raw, camera, date) { /* maps the three arrays */ }
```

It emits **`start_ms` / `end_ms` as numbers**, never strings, and every `Date.parse()` is
gone from `TimelineStrip.vue`, `TimelineView.vue`, `useTimelineGeometry.js` and
`TimelinePreview.vue`. That is the real lesson here: the geometry module is pure maths on
milliseconds and it should never have been handed a string to parse. Parsing at the edge
means there is exactly one place that can get the units wrong, and it has a test.

It also answers `null`, never `NaN`, and rows that normalise to `null` — or whose end is
not after their start, or that have no URL — are dropped. One malformed span costs you that
span, not the day.

**3. Make the tests test the API.** Three changes, and the third is the one that matters:

- `useTimelineGeometry.test.js` moves to milliseconds.
- `contract.test.js` pins `asEpochMs` on seconds, milliseconds, ATOM, numeric strings,
  `null` and garbage, and `normaliseTimelineDay` on both wire shapes, on ordering, and on
  the malformed rows it is supposed to drop.
- **The mock adapter now returns its day through `normaliseTimelineDay` too.** Not "the
  mock switches to `start_ms`" — routed through the same function, so the two adapters
  cannot drift apart again by construction. The mock was the half that looked right while
  the real one was broken; making it merely *agree* today would leave the same gap open.

#### How to check it is fixed

```bash
curl -s -b "$COOKIE" "https://api.edwintenbrinke.nl/api/cameras/voordeur/timeline?date=$(date +%F)&tz=Europe/Amsterdam" | jq '.recordings[0], .previews[0], .events[0]'
```

Every `start`/`end` reads as `2026-09-05T…Z`. In the browser: the strip draws grey spans
with a visible hole where recording stopped, the marker list under it is populated, and
dragging into a span and letting go loads a video instead of "Geen opname".

Checked here by rewriting the mock to emit **unix seconds** — the shape that used to empty
the page — and driving the real thing: the strip drew its spans and its gap identically to
the ISO run, and a drag back to 12:19:57 found the recording under the playhead and played
it (`readyState 4`, `currentTime 3.5`), with no gap message. That is the test worth
repeating, because it is the one the unit tests could not have failed on: both shapes, same
picture.

---

### A2. The playlist is signed; its segments are not

This one is hidden behind A1 today — you cannot reach playback while `rangeAt()` returns
`null` — and it will be the next thing that breaks.

`TimelineMediaController` says:

> **An HLS playlist references its segments relatively**, so every request after the first
> arrives without the signature that fetched the playlist. […] The session cookie covers
> those.

The first half is right. The second half does not survive contact with any of the three
clients this app actually has:

- **The web build is cross-origin.** `web/.env` — which is committed, and is what a
  container build sees — sets `VITE_API_BASE_URL=https://api.edwintenbrinke.nl`, while the
  app is served from `motion.edwintenbrinke.nl`. A cross-origin `XMLHttpRequest` sends no
  cookie unless it sets `withCredentials`, and `hls.js` does not.
  *(Worth settling separately: [11-deployment.md](11-deployment.md) describes one hostname
  with `/api` routed to motion-api, and [05](05-android-app.md#L144) says `VITE_API_BASE_URL`
  points at `motion.`. The committed `.env` disagrees with both. One of the three is wrong
  and it is not obvious from here which.)*
- **The native build has no cookie for this origin at all.** Capacitor serves from
  `capacitor://localhost`; there is no arrangement under which a `SameSite=None` cookie for
  `api.edwintenbrinke.nl` rides along.
- **Third-party cookies are being removed.** Even in the single-origin reading, building on
  a cookie that browsers are actively deprecating for cross-site use is borrowing time.

Where the cookie is not sent, `allowed()` sees no `sig` and no cookie and answers **403**,
per segment, forever. `hls.js` reports `fragLoadError`, the `<video>` stays black, and
`RecordingPlayer` had no error handling at all, so nothing was shown.

Relative URL resolution also **drops the query string** by definition — `seg-1.ts` next to
`index.m3u8?exp=…&sig=…` resolves to `…/seg-1.ts` with no query. So there is no arrangement
of relative paths that carries the signature. It has to be put back deliberately.

The same trap is in `MediaController::liveAuth()` with the same cookie reasoning. Live works
today because the ladder reaches WebRTC or MSE first and never falls to the HLS rung; the
day it does fall, it lands here.

#### Fix — rewrite the playlist, do not chase the cookie

Three options, and only one of them is small:

| Option | Cost | Why not / why |
|---|---|---|
| `withCredentials: true` in `hls.js` + CORS `allow_credentials` | Two lines | Depends on third-party-cookie behaviour that Chrome and Safari are actively removing, and the Capacitor build has no cookie at all (`capacitor://localhost` is a different origin again). **Do not build on this** |
| A signed cookie scoped to `/api/timeline`, set when the day loads | Medium | Same third-party-cookie exposure, plus a second credential mechanism to keep in step with the first — which 07 explicitly says not to invent |
| **Rewrite the playlist body, appending `exp`/`sig` to each segment URI** | ~30 lines in one controller | The signature keeps being the only credential. Works in the browser, in the WebView, and with `curl`. **Recommended** |

The playlist is a few kilobytes of text and it is the only response in this path that PHP
has any reason to look at. Segments keep going out through `X-Accel-Redirect` untouched, so
the "PHP decides, nginx moves the bytes" split survives intact — the playlist is a decision,
not bytes.

#### What was built

`TimelineMediaController::vod()` now branches on the extension. Anything that is not
`.m3u8` goes out through `X-Accel-Redirect` exactly as before; a playlist is fetched with
the new `FrigateClient::fetchText()` and rewritten by `signUris()`.

Four details that are the difference between working and nearly working:

- **Both kinds of URI.** A playlist names things in two places: a bare line (a segment, or
  a media playlist named by a master playlist) and a `URI="..."` attribute on a tag —
  `EXT-X-MAP` for the fMP4 init segment, `EXT-X-KEY`, `EXT-X-MEDIA`. Signing only the bare
  lines gives you a playlist that plays for exactly zero seconds, because the init segment
  403s. Both are handled, and both are covered by the check below.
- **A fresh signature, not the caller's.** This route still accepts a session cookie. A
  playlist fetched that way would otherwise hand out *unsigned* segment URLs — which is the
  precise state this method exists to prevent — so `playlist()` mints its own token rather
  than forwarding whatever got it in.
- **An hour, not ten minutes.** `MediaTokenService::TIMELINE_TTL_S`, used by both this
  controller and `CameraTimelineController`. Scrubbing is not one request: the playlist
  hands out signed URLs that a player keeps fetching for as long as someone watches, and at
  ten minutes playback dies mid-clip with a 403 the player cannot explain.
- **`no-store` on the playlist.** It has an expiry baked into its body now. A cached one
  keeps handing out dead segment URLs long after a fresh one would have worked.

Absolute URLs are left alone: appending our signature to someone else's host would leak it,
and Frigate's VOD module emits relative names anyway. The `exp`/`sig` check on segments is
untouched — the rewrite adds the credential, it does not remove the gate.

Verified against a master playlist and a media playlist, CRLF included:

```
#EXT-X-MAP:URI="init-v1-a1.mp4?exp=123&sig=abc"
seg-1-v1-a1.m4s?exp=123&sig=abc
seg-2-v1-a1.m4s?x=1&exp=123&sig=abc          ← existing query merged, not clobbered
#EXT-X-KEY:METHOD=AES-128,URI="https://elsewhere/key"   ← absolute, left alone
```

`RecordingPlayer` also grew the error state it never had. Every way this can fail — an
expired signature, a segment that 403s, a range whose recording has been retained away —
failed *silently* in a bare `<video>`: hls.js reported it on an event nobody was listening
to and the element stayed black, which is indistinguishable from "there is nothing here"
and has its own message. Its retry emits `reload` rather than replaying the same URL, since
the URL it holds carries the expired signature and only a fresh day response re-signs it.

**CORS also has to survive the `X-Accel-Redirect`,** and it did not. An `<img>` or
`<video src>` is not a CORS request; every `hls.js` fetch is. By the time the internal
`/_frigate/` location answers, what nginx holds are Frigate's response headers, not the ones
Symfony set on the reply that produced the redirect. So the location now adds them itself:

```nginx
add_header Access-Control-Allow-Origin "${APP_ORIGIN}" always;
add_header Vary Origin always;
```

`APP_ORIGIN` is a new entrypoint variable defaulting to empty, and nginx omits an
`add_header` whose value is empty — so a single-origin deployment gets no header, which is
correct, and a cross-origin one sets exactly one allowed origin rather than reflecting
whatever asked. **Set it if the app and the API are on different hostnames.** A missing
`ACAO` fails exactly like a 403 from the player's point of view, so distinguish the two
before spending an evening on the wrong one:

```bash
curl -sI -H "Origin: https://motion.edwintenbrinke.nl" "$API/api/timeline/..." | grep -i access-control
```

---

### A3. The preview scrubber fights itself

Two separate mistakes, both visible as "dragging shows black or a frozen frame".

**The component is remounted on every drag.** `TimelineView` renders the preview with
`v-else-if="mode === 'scrub'"` and the recording with `v-else`. Touching the strip switches
modes, so Vue destroys one `<video>` and creates another. `loadedUrl` is component state, so
it is `null` again, so the hourly preview file is downloaded from scratch — every drag,
even a drag inside the same hour you were already scrubbing.

The preview and the recording player now stay mounted and are shown with `v-show`; only
`LivePlayer` is still `v-if`, because a stream nobody is watching should stop. A `<video>`
that has already loaded its hour is the entire point of previews; throwing it away at the
start of each gesture spends the saving.

Two consequences of keeping things mounted, both handled: the recording player has to be
told to pause when it is hidden (a watcher on `mode`, since nothing unmounts it any more),
and the preview takes an `active` prop so it holds what it has loaded without seeking while
another surface is on screen.

**Seeks are issued faster than they complete.** The watcher sets `el.currentTime` on every
`props.ts` change — that is one write per `pointermove`, up to 120/s on a phone. A media
element ignores a `currentTime` write while a seek is pending; the browser keeps the *first*
and drops the rest, so the picture sticks on wherever the drag started and jumps once at the
end.

So: queue the newest target, and write it when the element is free. One seek in flight,
always the latest position — the standard shape for scrubbing a media element, and the
reason a native scrubber feels responsive while this one did not.

**With one trap that is worth the paragraph, because the first version of this fix fell
straight into it.** The obvious implementation keeps a `seeking` flag, sets it before the
write and clears it on `seeked`. But **writing `currentTime` to the value it already holds
fires no event at all** — so the first no-op write latches the flag on, every later position
queues behind an event that will never arrive, and the preview freezes. Which is the bug
being fixed, reintroduced by its own fix, and invisible in a unit test.

The version that shipped reads `el.seeking` — the element's own state, which cannot latch —
and skips the write entirely when the target is already under the playhead:

```js
function drain() {
  if (pending === null || !el || !current) return;
  if (!Number.isFinite(el.duration) || el.duration <= 0) return;
  if (el.seeking) return;                 // one in flight; `seeked` calls back here

  const target = previewFraction(pending, current) * el.duration;
  pending = null;
  if (Math.abs(target - el.currentTime) < 0.02) return;
  el.currentTime = target;
}
```

Measured in the browser: **41 pointermoves in one gesture produce one seek**, the picture
tracks the drag, and the `<video>` element is the same object after two separate gestures.

Two more while in this file:

- `previewFor()` returned `null` at an hour with no preview file and the watcher silently
  returned, leaving the previous hour's frame on screen as if it were current. It now shows
  "Geen beeld op dit moment", so the picture never lies about which minute it is. Note this
  is **not** the same as a recording gap: Frigate writes a preview file per hour whether or
  not it recorded, so the hole in the recordings still shows the recording message and a
  perfectly good preview. That is correct, and it is why both messages exist.
- `preload="auto"` on a per-hour file downloaded the whole hour on mount. Now
  `preload="metadata"` plus a seek, which is what this element exists to do.

---

### A4. The rest of the timeline page

- **`@scrub` was emitted and nobody listened.** Deleted. A dead event reads like a feature
  that exists.
- **The camera was hard-coded** — `const camera = ref('voordeur')`. Honest with one camera,
  wrong the day there are two. It now comes from `api.cameras.list()` (HANDOFF H2), with a
  chip row that only appears when there is a choice to make, styled from the events filter
  bar so there is one selection idiom rather than two.
- **`RecordingPlayer` is gone.** It used native `controls` while `VideoPlayer` shipped a full
  custom Dutch skin — two players, two behaviours, on adjacent screens. With B1 done they are
  the same component with different sources, so the timeline now renders `VideoPlayer` and
  the file is deleted.

  The merge is what turned `play(url, offset)` into props: the timeline holds
  `currentRange.vod_url` and a `recordingOffset`, and setting them *is* "start playing here".
  Two things fell out of that and both were caught by running it, not by reading it:

  - **`startAt` only applied on `loadedmetadata`.** The timeline's spans are hours long, so
    two releases minutes apart are usually the *same* URL — no source change, no
    `loadedmetadata`, and every seek after the first was silently ignored. Which is the
    original complaint about this page, arriving by a different route. There is now a watcher
    on `startAt` as well.
  - **The merged player assumed `hlsSrc` was always a playlist.** `RecordingPlayer` branched
    on `.m3u8`; merging dropped the check, and handing an mp4 to hls.js gets you a fatal
    manifest error rather than a video. The branch is back, on the URL rather than on which
    prop it arrived in.

- **Still open: `mode` and `date` are two pieces of state that can disagree.** A single
  `viewState` (`live | scrub | recording` + the timestamp) would remove the class of bug
  where they do. Not attempted.

### Bundle or own code, for the strip?

**Keep the own code.** This was worth checking and the answer is not close:

| Candidate | Why not |
|---|---|
| `vis-timeline` | Item/range oriented, DOM per item, ~200 kB. Built for Gantt-ish data, not for a continuous scrubber where time slides under a fixed playhead. Pinch-to-zoom anchoring would still be ours |
| `react-calendar-timeline` and friends | React |
| Frigate's own UI timeline | React, and welded to Frigate's internal API shape. Not extractable |
| A charting library (`uPlot`, `d3`) | Solves drawing, which is the part that already works |

`useTimelineGeometry.js` is 130 lines of pure, tested maths — pinch anchoring, tick
selection, clamping — and none of it is wrong. The strip was never the problem; it was drawing
`NaN` faithfully. Adding a dependency here trades correct code for a bigger bundle and an
integration layer, and still leaves A1 and A2 to fix.

---

## Part B — the clip player on an event

### B1. Frigate's `clip.mp4` is not a seekable file

The API is already honest about this in two places. `MediaController`:

> (Frigate itself answers 200 to a ranged GET on clip.mp4, so seeking within an event clip
> still re-downloads — an upstream limit, not one introduced here.)

and `docker/prod/nginx-api.conf.template`:

> Measured caveat: Frigate answers 200 to a ranged GET on `/api/events/<id>/clip.mp4` […]
> Event clips are a megabyte or two, so this is currently free.

It is not free, and the note under-reads its own measurement. What that upstream endpoint
produces is a **live ffmpeg mux**:

- no `Accept-Ranges`, and a `Range` request is answered `200` with the whole thing from the
  start;
- no `Content-Length`, because the length is not known when the first byte is written;
- **no duration in the container** — the `moov` atom is written progressively, so
  `video.duration` reports what has arrived, not what exists. `12-open-work.md` §3 already
  measured this: a three-second event read `0.999367` in Chrome.

A `<video>` element can only seek inside `video.seekable`, and `seekable` for a stream like
this is `[0, buffered]`. Writing `currentTime = 8` on a clip where the browser has one
second is not an error — the element clamps or ignores it, fires no `seeked`, and stays
where it was. Which is precisely the symptom: **the bar moves under your finger and the
picture does not.** ±10 s fails for the same reason. So does the speed button in effect,
because playback keeps stalling at the download edge.

The padding work in §6 of `12-open-work.md` made this worse rather than better, in a way
worth naming: the padded range endpoint (`/api/{camera}/start/{s}/end/{e}/clip.mp4`) is
*more* expensive to mux than the per-event one, and a padded clip for a long event — the
parked-car case, 154 minutes — is a mux that never finishes. The clip is not two megabytes
in that case; it is however much of it you sit through.

**No amount of frontend work fixes this.** Not a different player, not a different bundle.
The transport has to change.

#### Fix — serve clips as HLS VOD, from the endpoint the timeline already uses

Frigate exposes `nginx-vod-module` at

```
/vod/{camera}/start/{unix}/end/{unix}/index.m3u8
```

which is what `CameraTimelineController::groupRecordings()` already builds URLs for. That is
a **real VOD playlist**: `#EXT-X-PLAYLIST-TYPE:VOD`, every segment's duration listed, total
duration derivable before a single byte of video is fetched, and any segment fetchable
directly. Seeking becomes "load the segment covering t", which is instant and bounded.

The clip is already a time range — `MediaUrlBuilder::clipRange()` computes exactly the
padded `{camera, start, end}` this URL needs. So the change was small:

1. `MediaUrlBuilder::forEvent()` gained **`clip_hls`**, pointing at
   `/api/timeline/{camera}/vod/{start}/{end}/index.m3u8?exp&sig` — the same signed route the
   timeline uses, so it arrives with the A2 rewrite already applied and its segments are
   fetchable. Signed as `('timeline', <camera>)` rather than `('clip', <event id>)`, because
   that is what `TimelineMediaController` verifies and because the segments belong to the
   camera, not to the event: one gate, per camera.
2. `clip` stays as the mp4, for download and as the fallback. Note the app's own `Delen`
   shares the App Link, not the file, so the mp4 currently has no consumer other than the
   player's fallback path — that is fine, and it should stay reachable regardless.
3. `EventDetailView` passes `:hls-src`; `VideoPlayer` grew the `hls.js` branch, with
   three cases in order: hls.js where supported (including the Android WebView, which has
   no native HLS at all), the playlist straight on `src` where the platform plays HLS itself
   (Safari, iOS), and the mp4 when there is no playlist.
4. `clip_duration_s` stays as a fallback. Where hls.js is driving, `video.duration` is
   authoritative and the fragmented-MP4 workaround explicitly steps aside — otherwise the
   old "trust the longer number" rule would make the bar longer than the media again.

**A fix that fell out on the way.** `withAbsoluteMedia()` in the events adapter rebuilt the
media object from four keys, so `clip_duration_s` was dropped on every event before it
reached a component. The padded duration from §6 of [12](12-open-work.md) has therefore
never actually been displayed; `EventDetailView` has been falling through to the event's own
`duration_s` the whole time. It is passed through now.

**One caveat, and it is measured by falling back rather than assumed.** `nginx-vod-module`
needs the recording segments to still exist for the requested range, and Frigate's retention
for `record` and for event clips are separate settings — so an old event can have a working
mp4 and an empty playlist. `VideoPlayer` treats a fatal hls.js error as exactly that: it
drops to the mp4 once, silently, and only a second failure shows the error panel. Verified
by pointing `clip_hls` at a playlist that does not exist — the request goes out, the fatal
error arrives, and the player is on the mp4 and playing within 100 ms, with no error panel.
The success path needs a real Frigate and has not been run.

Also worth checking while there, and **not done**: `X-Accel-Buffering: no` is set on every
media response in `MediaController::get()`. That is right for a progressive mux and pointless
for a segment — it disables the buffering that makes many small files fast.

### B2. `seekTo()` never asks whether it can seek

Even with a well-behaved source, the player has no idea when a seek is refused:

```js
function seekTo(seconds) {
  if (!video.value) return;
  video.value.currentTime = seconds;
  currentTime.value = seconds;   // ← the UI now claims a position the media does not have
  showControls();
}
```

Two defects in three lines. It writes `currentTime` without checking `video.seekable`, and
it *optimistically updates the displayed position* — so when the seek is ignored the bar
still moves, which is the difference between "this player is broken" and "that part is not
downloaded yet". Same in `skip()`, which clamps to `duration.value` (the *known* duration)
rather than to `seekable.end(seekable.length - 1)`.

`seekTo()` now clamps to `seekable.end(...)` and writes nothing else — the element's own
`timeupdate` moves the bar, so what you see is where the media actually is. `skip()` is a
one-line call into it rather than a second copy of the clamping.

`seekable` is re-read on `loadedmetadata`, `progress`, `timeupdate` and `seeked` rather than
cached once, because it *moves*: a VOD playlist reports the whole thing immediately, a
progressive mp4 grows it as bytes arrive. Caching it at load would freeze the bar's idea of
what is reachable at whatever had arrived in the first second.

`seeking`/`waiting` and `seeked`/`playing`/`canplay` now drive a spinner. A seek across an
unbuffered gap takes a moment even when everything works, and an unacknowledged tap is
indistinguishable from a broken one.

Measured: asking the bar for second 60 of a clip whose media stops at 8 lands the playhead at
**7.75** — `seekableEnd - SKIP_GUARD_S` — and the clock reads `0:07`. The old code would have
displayed `1:00` over a video that never moved.

### B3. The scrub bar advertises a range the media does not have

```html
<input class="scrub" type="range" min="0" :max="duration || 0" step="0.1" :value="currentTime" />
```

`duration` deliberately prefers `knownDuration` — the padded length from the API — over
`video.duration`, for the good reason given in the comment. But that makes the bar's full
width represent 14 seconds while the media can only seek within the ~1 second it has muxed.
**Most of the bar is dead**, and it looks identical to the live part.

With B1 done, `video.duration` is trustworthy where hls.js is driving and the conflict
disappears — but the mp4 fallback still has it, so the bar now **draws both numbers**. The
native range input is skinned down to its thumb and the track is drawn as two divs: how much
of the clip exists, and how much of it can be reached. Where those differ, the difference is
the whole point; an unreachable stretch has to look unreachable rather than identical to a
working one.

Two smaller ones in the same component, both done:

- **`@input` scrubbed continuously**, issuing a seek per intermediate value — A3's seek-storm
  again on a different element. `input` now moves only the thumb (a local `scrubPosition`
  that the clock and the bar prefer over the media's own time); `change` commits one seek on
  release.
- **The controls hid after 3 s of playback, including while you were dragging the bar.**
  `scheduleHide()` ran off a timer that a pointer held on the thumb did not reset. A
  `pointerdown` anywhere in `.controls` now holds them open and `pointerup` restarts the
  timer.

### Bundle or own code, for the player?

Here a bundle is defensible, and the ordering matters: **B1 first, then decide.** Swapping
the player before fixing the transport changes nothing — a better UI over a non-seekable
stream is a better-looking broken player.

| Option | Size | Verdict |
|---|---|---|
| **`hls.js` + keep the custom skin** | already a dependency | **Recommended.** The UI is not the problem, it is 200 lines, it is in Dutch, and it matches the rest of the app. `RecordingPlayer` already does the `hls.js` half — the work is merging two components, not adopting a framework |
| Vidstack | ~100 kB | Genuinely good, Vue-friendly, solid mobile gestures and a real buffered-range UI. The case for it is *deleting* our player, not augmenting it. Reasonable if the merged player starts growing features (thumbnails on the bar, chapters, PiP) |
| video.js + `@videojs/http-streaming` | ~180 kB | Heaviest, oldest API, skinning fights its CSS. No |
| Plyr | ~50 kB | Pretty, but still needs `hls.js` beside it and its own theming. Buys little over what exists |

The honest summary: the player's problems are one transport bug and three small correctness
bugs, none of which a library fixes for you, and all of which a library would also have to be
fed correct data to solve. Take `hls.js`, keep the skin, and revisit Vidstack only if the
feature list grows.

---

## Order of work

Each step is independently shippable and each one is visible.

| Step | Change | Done when |
|---|---|---|
| 1 ✅ | A1 — ATOM in the API, `asEpochMs` + `normaliseTimelineDay` in `contract.js`, `Date.parse` deleted from the timeline components, tests moved to numbers | The strip draws spans and gaps, the marker list fills, dragging into a span stops saying "Geen opname" |
| 2 ✅ | A2 — rewrite the playlist, CORS on segments, longer timeline token, error state in `RecordingPlayer` | Letting go of a drag plays the recording from the right second; segments return 200 with `curl` and no cookie |
| 3 ✅ | A3 — keep the preview mounted, coalesce seeks, honest empty state at gaps | Dragging across an hour shows moving frames, not a frozen one |
| 4 ✅ | B1 — `clip_hls` from the VOD range, `hls.js` in `VideoPlayer`, mp4 kept for share/download | The clock shows the real padded length before playback starts |
| 5 ✅ | B2/B3 — `seekable`-aware seeking, buffered track, seek on `change`, spinner between `seeking` and `seeked` | Dragging the bar to 12 s lands on 12 s; ±10 s works; the dead part of the bar is visibly dead |
| 6 ✅ | A4 — merge the two players, camera from the API, delete the dead `scrub` emit | One player component, one behaviour, on both screens |

## What to verify, and how

Not in the browser first. Each of these fails independently and the browser reports them all
the same way:

```bash
# 1 — units. Every start/end must be an ISO string.
curl -s -b "$COOKIE" "$API/api/cameras/voordeur/timeline?date=$(date +%F)&tz=Europe/Amsterdam" \
  | jq '{r: .recordings[0], p: .previews[0], e: .events[0]}'

# 2 — the playlist carries the signature down to its segments.
PL=$(curl -s "$API/api/timeline/voordeur/vod/$START/$END/index.m3u8?exp=$EXP&sig=$SIG")
echo "$PL" | grep -v '^#' | head -3          # each line must contain exp= and sig=

# 3 — a segment is fetchable with NO cookie at all.
curl -s -o /dev/null -w '%{http_code}\n' "$API/api/timeline/voordeur/vod/$START/$END/$SEG?exp=$EXP&sig=$SIG"

# 4 — CORS, from the app's origin.
curl -sI -H "Origin: https://motion.edwintenbrinke.nl" "$API/api/timeline/..." | grep -i access-control

# 5 — the VOD playlist is a real VOD, with a duration.
echo "$PL" | grep -E 'EXT-X-PLAYLIST-TYPE|EXTINF' | head

# 6 — and the thing that started all this: the mp4 does not support Range.
curl -sI -H 'Range: bytes=0-1023' "$API/api/media/clip/$EVENT_ID?exp=$EXP&sig=$SIG" | head -1
#   206 → seeking would work.  200 → it cannot, which is why B1 exists.
```

Then the browser, and only then. The rule that produced every finding in
[12-open-work.md](12-open-work.md) applies here unchanged: **run it, do not read it.** Both
of these bugs are in code that looks right, passes its tests, and answers every request with
a success.
