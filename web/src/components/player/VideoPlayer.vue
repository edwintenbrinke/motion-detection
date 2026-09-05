<template>
  <div class="player" :class="{ 'controls-hidden': !controlsVisible }">
    <video
        ref="video"
        class="video"
        :src="nativeSrc ?? undefined"
        :poster="poster ?? undefined"
        playsinline
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @progress="onBuffered"
        @seeking="busy = true"
        @seeked="onSeeked"
        @waiting="busy = true"
        @playing="busy = false"
        @canplay="busy = false"
        @play="playing = true"
        @pause="playing = false"
        @ended="onEnded"
        @error="onError"
        @click="toggleControls"
    ></video>

    <div v-if="failed" class="overlay">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <p>{{ errorText }}</p>
      <button type="button" @click="$emit('retry')">Opnieuw</button>
    </div>

    <button v-else-if="!playing && !started" type="button" class="big-play" aria-label="Afspelen" @click="play">
      <i class="pi pi-play" aria-hidden="true"></i>
    </button>

    <div v-if="busy && !failed" class="busy" aria-hidden="true">
      <i class="pi pi-spin pi-spinner"></i>
    </div>

    <div v-if="!failed" class="controls" @click.stop @pointerdown="holdControls" @pointerup="releaseControls">
      <!--
        The rail behind the thumb is not decoration: `duration` is the length of the clip and
        the seekable extent is how much of it you can actually reach. Drawing only the first
        made most of the bar look identical to the part that works.
      -->
      <div class="scrub-wrap">
        <div class="scrub-rail">
          <div class="scrub-seekable" :style="{ width: `${seekablePercent}%` }"></div>
          <div class="scrub-played" :style="{ width: `${playedPercent}%` }"></div>
        </div>
        <input
            class="scrub"
            type="range"
            min="0"
            :max="duration || 0"
            step="0.1"
            :value="displayTime"
            aria-label="Positie in de clip"
            @input="onScrubInput"
            @change="onScrubCommit"
        />
      </div>

      <div class="buttons">
        <button type="button" aria-label="10 seconden terug" @click="skip(-10)">
          <i class="pi pi-backward" aria-hidden="true"></i><span class="small">10</span>
        </button>

        <button type="button" :aria-label="playing ? 'Pauzeren' : 'Afspelen'" @click="togglePlay">
          <i :class="playing ? 'pi pi-pause' : 'pi pi-play'" aria-hidden="true"></i>
        </button>

        <button type="button" aria-label="10 seconden vooruit" @click="skip(10)">
          <i class="pi pi-forward" aria-hidden="true"></i><span class="small">10</span>
        </button>

        <span class="clock">{{ formatClock(displayTime) }} / {{ formatClock(duration) }}</span>

        <button type="button" class="rate" :aria-label="`Snelheid ${rate} keer`" @click="cycleRate">
          {{ rate }}&times;
        </button>

        <button type="button" aria-label="Volledig scherm" @click="toggleFullscreen">
          <i class="pi pi-window-maximize" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { formatClock } from '@/lib/datetime.js';
import { isMediaStale } from '@/api/contract.js';

/**
 * The clip player.
 *
 * The previous implementation downloaded the whole clip through axios as a blob before
 * playing a frame, because a bearer token cannot ride on `<video src>`. That meant no
 * seeking until the download finished and the entire file in memory. Signed media URLs
 * (docs/v2/07-api-and-data-model.md#media-tokens) remove the reason for it: the URL
 * authenticates itself, so the browser can fetch it directly.
 *
 * **Prefer `hlsSrc` over `src`, and the reason is not preference.** `src` is Frigate's
 * `clip.mp4`: a mux built on the fly, which answers 200 to a ranged GET, carries no
 * Content-Length and writes its `moov` progressively. A <video> can only seek inside
 * `video.seekable`, and for a source like that `seekable` is "whatever has arrived" -- so
 * the scrub bar moved under your finger and the picture did not, and neither did the skip
 * buttons. No player and no library fixes that; the transport has to change. `hlsSrc` is
 * the same padded window as a VOD playlist, which lists every segment with its duration:
 * the length is known before a frame is fetched and seeking is "load the segment covering
 * t". See docs/v2/13-timeline-and-players.md#b1.
 *
 * The mp4 stays as the fallback, because it can outlive its own recording: event clips and
 * continuous recordings have separate retention in Frigate, so an old event can have a
 * clip and an empty playlist.
 */
const props = defineProps({
  /** The progressive mp4. Plays, cannot be seeked. Fallback and download. */
  src: { type: String, default: null },
  /** The HLS playlist for the same window. Preferred: this one seeks. */
  hlsSrc: { type: String, default: null },
  poster: { type: String, default: null },
  /** ISO timestamp; a signed URL past it will 403 rather than play. */
  expiresAt: { type: String, default: null },
  autoplay: { type: Boolean, default: false },
  /**
   * Known clip length in seconds, for when the media does not carry one.
   *
   * Frigate serves clips as fragmented MP4 with no duration in the header and no
   * Content-Length, so `video.duration` reports only what has been buffered so far and
   * grows as it downloads -- a 3-second event measured 0.999367 in Chrome. Every reader of
   * `duration` here (the clock, the scrubber's max, the skip clamp) was built on that.
   *
   * The app already knows the real answer: EventDetailView has the event, and
   * `normaliseEvent()` computes `duration_s` from started_at/ended_at. So the fallback is
   * not a guess, it is Frigate's own record of how long the thing lasted.
   */
  knownDuration: { type: Number, default: null },
  /** What the failure overlay says. A recording is not a clip. */
  errorText: { type: String, default: 'Clip niet beschikbaar' },
  /**
   * Seconds to start at. Used by the timeline, where the source is a whole recording span
   * and the interesting moment is somewhere in the middle of it.
   */
  startAt: { type: Number, default: 0 },
  /**
   * False while another surface is on screen. The timeline hides this player rather than
   * unmounting it -- otherwise every drag would throw away the stream it just started -- and
   * a hidden player that keeps running is audible, costs bandwidth, and is invisible.
   */
  active: { type: Boolean, default: true },
});

const emit = defineEmits(['expired', 'ended', 'retry']);

const RATES = [0.5, 1, 1.5, 2];
const SKIP_GUARD_S = 0.25;

const video = ref(null);
const playing = ref(false);
const started = ref(false);
const failed = ref(false);
const mediaDuration = ref(0);
const currentTime = ref(0);

/** What ends up on the element's `src` attribute; null while hls.js owns the media. */
const nativeSrc = ref(null);
/** True once hls.js is driving, which is also when `video.duration` can be trusted. */
const streaming = ref(false);
/** How far the media can actually be seeked, in seconds. Not the same as `duration`. */
const seekableEnd = ref(0);
/** A seek or a stall is in progress. An unacknowledged tap looks like a broken player. */
const busy = ref(false);
/** Where the finger is while dragging the bar; null when it is not being dragged. */
const scrubPosition = ref(null);
let hls = null;
let fellBackToMp4 = false;

/**
 * Prefer what the media says, but only when it is worth believing. `Infinity` is a live
 * stream, `NaN` is not-yet-known, and a value shorter than the length we were told is the
 * fragmented-MP4 case reporting its buffer rather than its length.
 */
const duration = computed(() => {
  const media = mediaDuration.value;
  const known = props.knownDuration;
  const mediaUsable = Number.isFinite(media) && media > 0;

  if (!mediaUsable) return Number.isFinite(known) && known > 0 ? known : 0;
  // A VOD playlist states its length; the fragmented-MP4 workaround below must not
  // override it, or the bar ends up longer than the media it is scrubbing.
  if (streaming.value) return media;
  if (Number.isFinite(known) && known > media) return known;
  return media;
});
/** What the bar and the clock show: the finger while dragging, the media otherwise. */
const displayTime = computed(() => scrubPosition.value ?? currentTime.value);

const percent = (value) => (duration.value > 0 ? Math.min(100, Math.max(0, (value / duration.value) * 100)) : 0);
const seekablePercent = computed(() => percent(seekableEnd.value));
const playedPercent = computed(() => percent(displayTime.value));

const rate = ref(1);
const controlsVisible = ref(true);

// Preserved across a re-signed URL, so recovering from an expiry does not restart the clip.
let resumeAt = 0;
let expiredReported = false;
let hideTimer = null;
let held = false;

// A new URL (usually a re-signed one) is a fresh chance, not a fresh clip: clear the error
// state and let onLoadedMetadata put the playhead back where it was.
watch(() => [props.src, props.hlsSrc], () => {
  failed.value = false;
  expiredReported = false;
  fellBackToMp4 = false;
  seekableEnd.value = 0;
  scrubPosition.value = null;
  attach();
});

// Not an `immediate` watcher: attaching needs the element, and during setup there is none.
onMounted(attach);

watch(() => props.active, (isActive) => {
  if (!isActive) video.value?.pause();
});

/**
 * A new start position inside the *same* source.
 *
 * The timeline's spans are hours long, so two releases minutes apart are usually the same
 * URL -- the source watcher does not fire, no `loadedmetadata` follows, and applying
 * `startAt` only there would silently ignore every seek but the first. Which is the
 * original complaint about this page, arriving by a different route.
 */
watch(() => props.startAt, (seconds) => {
  const el = video.value;
  if (!el || seconds <= 0) return;
  // Before metadata there is nothing to seek in; onLoadedMetadata picks it up instead.
  if (!Number.isFinite(el.duration) || el.duration <= 0) return;

  seekTo(seconds);
  if (props.autoplay) play();
});

/**
 * Point the element at the best source it can actually use.
 *
 * Three cases, in order: hls.js where it is supported (every browser that matters, and the
 * Android WebView, which has no native HLS at all); the playlist straight on `src` where
 * the platform plays HLS itself (Safari, iOS); and the mp4 when there is no playlist.
 */
async function attach() {
  detachHls();
  streaming.value = false;

  const el = video.value;
  const playlist = props.hlsSrc;

  if (!playlist || fellBackToMp4) {
    nativeSrc.value = props.src;
    return;
  }

  // A URL is not a playlist because of which prop it arrived in. The timeline's spans are
  // `.m3u8` in production and a plain file in the mock, and handing an mp4 to hls.js gets
  // you a fatal manifest error rather than a video. This check is not defensive padding --
  // it is the branch the old RecordingPlayer had, and merging the two players dropped it.
  if (!/\.m3u8(\?|$)/i.test(playlist)) {
    nativeSrc.value = playlist;
    return;
  }

  const { default: Hls } = await import('hls.js');

  if (Hls.isSupported()) {
    nativeSrc.value = null;
    if (!el) return;

    // startPosition rather than a seek after the fact: hls.js then loads the right segment
    // first instead of fetching the beginning and throwing it away.
    hls = new Hls({ backBufferLength: 60, startPosition: props.startAt > 0 ? props.startAt : -1 });
    hls.loadSource(playlist);
    hls.attachMedia(el);
    streaming.value = true;

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data?.fatal) onStreamFailed();
    });
    return;
  }

  if (el?.canPlayType('application/vnd.apple.mpegurl')) {
    nativeSrc.value = playlist;
    streaming.value = true;
    return;
  }

  nativeSrc.value = props.src;
}

/**
 * A dead playlist is not a dead clip.
 *
 * The likeliest cause is a range whose recording segments retention has already removed --
 * event clips and continuous recordings expire on separate schedules in Frigate. The mp4
 * still exists in that case. It cannot be seeked, which is worse, and it plays, which is
 * better than a black rectangle. Fall back once; a second failure is a real failure.
 */
function onStreamFailed() {
  detachHls();
  streaming.value = false;

  if (!fellBackToMp4 && props.src) {
    fellBackToMp4 = true;
    nativeSrc.value = props.src;
    return;
  }
  failed.value = true;
}

function detachHls() {
  hls?.destroy();
  hls = null;
}

async function play() {
  if (!video.value) return;

  // Catch the expiry before the browser turns it into an opaque media error.
  if (isMediaStale({ expires_at: props.expiresAt }, Date.now(), 30_000)) {
    reportExpired();
    return;
  }

  try {
    started.value = true;
    await video.value.play();
    scheduleHide();
  } catch {
    // Autoplay refused. The big play button is still there.
    started.value = false;
  }
}

function togglePlay() {
  if (!video.value) return;
  if (video.value.paused) {
    play();
  } else {
    video.value.pause();
    showControls();
  }
}

function skip(seconds) {
  if (!video.value) return;
  seekTo(video.value.currentTime + seconds);
}

/**
 * Seek, but only as far as the media can actually go.
 *
 * The old version wrote `currentTime` unconditionally and then moved the displayed position
 * to match. Both halves were wrong. A <video> can only seek inside `video.seekable`, so on a
 * progressive source the write was ignored -- and because the UI had already jumped, the
 * result read as "this player is broken" rather than "that part is not downloaded yet".
 * Clamp to what is reachable, and let the element's own `timeupdate` move the bar.
 * See docs/v2/13-timeline-and-players.md#b2.
 */
function seekTo(seconds) {
  const el = video.value;
  if (!el) return;

  const limit = Math.max(0, seekableEnd.value - SKIP_GUARD_S);
  const target = Math.min(Math.max(0, seconds), limit);

  if (Number.isFinite(target)) el.currentTime = target;
  showControls();
}

/** Dragging moves the thumb. It does not seek: one seek per gesture, on release. */
function onScrubInput(event) {
  scrubPosition.value = Number(event.target.value);
  showControls();
}

function onScrubCommit(event) {
  const target = Number(event.target.value);
  scrubPosition.value = null;
  seekTo(target);
}

/**
 * `seekable` is the authority on what can be reached, and it changes as the media loads:
 * a VOD playlist reports the whole thing immediately, a progressive mp4 grows it as bytes
 * arrive. Read it on every event that can move it rather than caching it once.
 */
function refreshSeekable() {
  const ranges = video.value?.seekable;
  seekableEnd.value = ranges?.length ? ranges.end(ranges.length - 1) : 0;
}

function onBuffered() {
  refreshSeekable();
}

function onSeeked() {
  busy.value = false;
  refreshSeekable();
}

function cycleRate() {
  const next = RATES[(RATES.indexOf(rate.value) + 1) % RATES.length];
  rate.value = next;
  if (video.value) video.value.playbackRate = next;
  showControls();
}

async function toggleFullscreen() {
  const el = video.value?.parentElement;
  if (!el) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  } catch {
    // Refused, or unsupported in this WebView. Nothing useful to say about it.
  }
}

function onLoadedMetadata() {
  const el = video.value;
  if (!el) return;

  mediaDuration.value = el.duration ?? 0;
  el.playbackRate = rate.value;
  refreshSeekable();

  // Seeking is only legal once the duration is known, which is why both of these live here
  // rather than next to the URL change that caused them. `resumeAt` wins over `startAt`:
  // recovering from an expired link should not throw away where you were.
  const target = resumeAt > 0 ? resumeAt : (props.startAt ?? 0);
  if (target > 0) seekTo(target);
  resumeAt = 0;

  if (props.autoplay && !started.value) play();
}

function onTimeUpdate() {
  currentTime.value = video.value?.currentTime ?? 0;
  refreshSeekable();
}

function onEnded() {
  playing.value = false;
  showControls();
  emit('ended');
}

/**
 * A 403 on an expired signed URL surfaces here as a generic media error with no status, so
 * an expiry and a genuinely missing clip are indistinguishable. Ask for a re-signed URL
 * once; if that fails too, it is missing.
 */
function onError() {
  // While hls.js owns the media, its own ERROR event is the authoritative one -- the
  // element's `error` fires for things hls.js recovers from on its own.
  if (streaming.value && hls) return;
  if (!nativeSrc.value) return;
  if (expiredReported) {
    failed.value = true;
    return;
  }
  reportExpired();
}

function reportExpired() {
  expiredReported = true;
  resumeAt = currentTime.value;
  emit('expired');
}

/**
 * A finger resting on the thumb is the one moment the controls must not disappear, and the
 * auto-hide timer does not know about it -- it fires three seconds after playback started
 * regardless of what is being held.
 */
function holdControls() {
  held = true;
  clearTimeout(hideTimer);
  controlsVisible.value = true;
}

function releaseControls() {
  held = false;
  scheduleHide();
}

function showControls() {
  controlsVisible.value = true;
  clearTimeout(hideTimer);
  scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (!playing.value || held) return;
  hideTimer = setTimeout(() => {
    controlsVisible.value = false;
  }, 3000);
}

function toggleControls() {
  if (controlsVisible.value) {
    controlsVisible.value = false;
    clearTimeout(hideTimer);
  } else {
    showControls();
  }
}

watch(playing, (isPlaying) => (isPlaying ? scheduleHide() : showControls()));

onBeforeUnmount(() => {
  clearTimeout(hideTimer);
  detachHls();
  if (video.value) {
    video.value.pause();
    // Detach the source, or the WebView keeps buffering a clip nobody is watching.
    video.value.removeAttribute('src');
    video.value.load();
  }
});

defineExpose({ play, pause: () => video.value?.pause() });
</script>

<style scoped>
.player {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--app-space-2);
  background: rgba(0, 0, 0, 0.7);
  color: var(--app-text-muted);
}

.overlay i {
  font-size: 26px;
  color: var(--app-accent);
}

.overlay p {
  margin: 0;
}

.overlay button,
.big-play {
  padding: 8px 16px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.big-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 58px;
  height: 58px;
  padding: 0;
  border-radius: 50%;
  font-size: 20px;
}

.controls {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--app-space-4) var(--app-space-3) var(--app-space-2);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  transition: opacity 0.25s ease;
}

.controls-hidden .controls {
  opacity: 0;
  pointer-events: none;
}

/*
  The bar is drawn rather than skinned. A native range input paints one filled track, and
  this needs two: how much of the clip exists, and how much of it can be reached. Where those
  differ, the difference is the whole point -- an unreachable stretch has to look unreachable
  instead of identical to a working one.
*/
.scrub-wrap {
  position: relative;
  display: flex;
  align-items: center;
  height: 20px;
  margin-bottom: 2px;
}

.scrub-rail {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
  pointer-events: none;
}

.scrub-seekable {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(255, 255, 255, 0.42);
}

.scrub-played {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--app-accent);
}

.scrub {
  position: relative;
  width: 100%;
  margin: 0;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
}

.scrub::-webkit-slider-runnable-track {
  height: 4px;
  background: transparent;
}

.scrub::-moz-range-track {
  height: 4px;
  background: transparent;
}

.scrub::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border: none;
  border-radius: 50%;
  background: var(--app-accent);
}

.scrub::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 50%;
  background: var(--app-accent);
}

.busy {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 26px;
  pointer-events: none;
}

.buttons {
  display: flex;
  align-items: center;
  gap: var(--app-space-1);
  color: #fff;
}

.buttons button {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: #fff;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.small {
  font-size: 10px;
  font-weight: 600;
}

.clock {
  flex: 1;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.85);
}

.rate {
  font-size: 13px !important;
  font-weight: 600;
  min-width: 34px;
}
</style>
