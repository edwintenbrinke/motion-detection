<template>
  <div class="wrap">
    <video
        ref="video"
        class="preview"
        muted
        playsinline
        preload="metadata"
        @loadedmetadata="onLoadedMetadata"
        @seeked="onSeeked"
    ></video>

    <div v-if="!preview" class="blank">
      <i class="pi pi-video-slash" aria-hidden="true"></i>
      <p>Geen beeld op dit moment</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { previewFraction } from './useTimelineGeometry.js';

/**
 * The frames you see while dragging.
 *
 * Frigate writes a low-fps preview file per hour per camera, which is the piece that makes a
 * Ring-style timeline affordable: scrubbing an hour costs a few hundred kilobytes instead of
 * streaming an hour of 1080p (docs/v2/02-video-transport.md). Dragging seeks inside that
 * file; letting go switches to the real recording.
 *
 * This component stays mounted across gestures on purpose (`active` says whether it is the
 * one on screen). It used to live behind a `v-if` on the drag, so every drag destroyed the
 * <video> and re-downloaded the hour it had already fetched -- including a drag inside the
 * hour that was already loaded, which is the common one. Previews exist to be cheap; the
 * remount spent the saving. See docs/v2/13-timeline-and-players.md#a3.
 */
const props = defineProps({
  previews: { type: Array, default: () => [] },
  ts: { type: Number, required: true },
  /** False while another surface is on screen: keep what is loaded, stop seeking. */
  active: { type: Boolean, default: true },
});

const video = ref(null);
let loadedUrl = null;

/**
 * One seek in flight, and always the newest position.
 *
 * A media element ignores a `currentTime` write while a seek is pending -- it keeps the
 * first and drops the rest. The watcher fires once per pointermove, up to 120/s on a phone,
 * so the picture stuck wherever the drag began and jumped once at the end. Queue the latest
 * target instead and drain it when the element is free.
 *
 * "Free" is read from `el.seeking` rather than tracked in a flag of our own, and that is
 * not a style choice. A flag has to be cleared by a `seeked` event -- and writing
 * `currentTime` to the value it already holds fires **no event at all**, so the flag
 * latches on the first such write and every later position queues behind it forever. That
 * bug is easy to write, silent, and looks exactly like the one this function replaces.
 * See docs/v2/13-timeline-and-players.md#a3.
 */
let pending = null;

const preview = computed(() => props.previews.find((p) => props.ts >= p.start_ms && props.ts < p.end_ms) ?? null);

function drain() {
  const el = video.value;
  const current = preview.value;

  if (!el || !current || pending === null) return;
  // Seeking before the duration is known is silently ignored, so wait for it rather than
  // spending the queued position on a no-op.
  if (!Number.isFinite(el.duration) || el.duration <= 0) return;
  // A seek is already running; `seeked` calls back here with whatever is queued by then.
  if (el.seeking) return;

  const target = previewFraction(pending, current) * el.duration;
  pending = null;

  // Already there. Writing it anyway costs nothing and fires nothing, which is fine --
  // skipping it just keeps the "no event" case out of the logic above.
  if (Math.abs(target - el.currentTime) < 0.02) return;

  el.currentTime = target;
}

function onSeeked() {
  drain();
}

function onLoadedMetadata() {
  drain();
}

watch(
    () => [props.ts, props.active, preview.value],
    () => {
      const el = video.value;
      const current = preview.value;
      if (!el) return;

      // A gap, or an hour with no preview file. Show that, rather than leaving the last
      // frame on screen pretending to be this minute.
      if (!current) {
        pending = null;
        return;
      }

      if (current.preview_url !== loadedUrl) {
        loadedUrl = current.preview_url;
        pending = null;
        el.src = current.preview_url;
        el.load();
      }

      if (!props.active) return;

      pending = props.ts;
      drain();
    },
    { immediate: true },
);

onBeforeUnmount(() => {
  const el = video.value;
  if (!el) return;
  el.removeAttribute('src');
  el.load();
});
</script>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
}

.preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}

.blank {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--app-space-2);
  background: #000;
  color: var(--app-text-faint);
}

.blank i {
  font-size: 26px;
}

.blank p {
  margin: 0;
  font-size: 14px;
}
</style>
