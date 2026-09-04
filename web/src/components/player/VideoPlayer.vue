<template>
  <div class="player" :class="{ 'controls-hidden': !controlsVisible }">
    <video
        ref="video"
        class="video"
        :src="src ?? undefined"
        :poster="poster ?? undefined"
        playsinline
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @timeupdate="onTimeUpdate"
        @play="playing = true"
        @pause="playing = false"
        @ended="onEnded"
        @error="onError"
        @click="toggleControls"
    ></video>

    <div v-if="failed" class="overlay">
      <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
      <p>Clip niet beschikbaar</p>
      <button type="button" @click="$emit('retry')">Opnieuw</button>
    </div>

    <button v-else-if="!playing && !started" type="button" class="big-play" aria-label="Afspelen" @click="play">
      <i class="pi pi-play" aria-hidden="true"></i>
    </button>

    <div v-if="!failed" class="controls" @click.stop>
      <input
          class="scrub"
          type="range"
          min="0"
          :max="duration || 0"
          step="0.1"
          :value="currentTime"
          aria-label="Positie in de clip"
          @input="seekTo(Number($event.target.value))"
      />

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

        <span class="clock">{{ formatClock(currentTime) }} / {{ formatClock(duration) }}</span>

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
import { ref, watch, onBeforeUnmount, computed } from 'vue';
import { formatClock } from '@/lib/datetime.js';
import { isMediaStale } from '@/api/contract.js';

/**
 * The clip player.
 *
 * The previous implementation downloaded the whole clip through axios as a blob before
 * playing a frame, because a bearer token cannot ride on `<video src>`. That meant no
 * seeking until the download finished and the entire file in memory. Signed media URLs
 * (docs/v2/07-api-and-data-model.md#media-tokens) remove the reason for it: the URL
 * authenticates itself, so the browser can do ordinary Range requests and seek immediately.
 */
const props = defineProps({
  src: { type: String, default: null },
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
  if (Number.isFinite(known) && known > media) return known;
  return media;
});
const rate = ref(1);
const controlsVisible = ref(true);

// Preserved across a re-signed URL, so recovering from an expiry does not restart the clip.
let resumeAt = 0;
let expiredReported = false;
let hideTimer = null;

// A new URL (usually a re-signed one) is a fresh chance, not a fresh clip: clear the error
// state and let onLoadedMetadata put the playhead back where it was.
watch(() => props.src, () => {
  failed.value = false;
  expiredReported = false;
});

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
  if (!video.value || !duration.value) return;
  const target = video.value.currentTime + seconds;
  video.value.currentTime = Math.min(Math.max(0, target), duration.value - SKIP_GUARD_S);
  showControls();
}

function seekTo(seconds) {
  if (!video.value) return;
  video.value.currentTime = seconds;
  currentTime.value = seconds;
  showControls();
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

  // Seeking is only legal once the duration is known, which is why the resume lives here
  // rather than next to the URL change that caused it.
  if (resumeAt > 0 && resumeAt < duration.value) {
    el.currentTime = resumeAt;
  }
  resumeAt = 0;

  if (props.autoplay && !started.value) play();
}

function onTimeUpdate() {
  currentTime.value = video.value?.currentTime ?? 0;
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
  if (!props.src) return;
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

function showControls() {
  controlsVisible.value = true;
  clearTimeout(hideTimer);
  scheduleHide();
}

function scheduleHide() {
  clearTimeout(hideTimer);
  if (!playing.value) return;
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

.scrub {
  width: 100%;
  margin: 0 0 2px;
  accent-color: var(--app-accent);
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
