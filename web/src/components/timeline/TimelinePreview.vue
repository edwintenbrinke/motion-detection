<template>
  <video ref="video" class="preview" muted playsinline preload="auto"></video>
</template>

<script setup>
import { ref, watch } from 'vue';
import { previewFraction } from './useTimelineGeometry.js';

/**
 * The frames you see while dragging.
 *
 * Frigate writes a low-fps preview file per hour per camera, which is the piece that makes a
 * Ring-style timeline affordable: scrubbing an hour costs a few hundred kilobytes instead of
 * streaming an hour of 1080p (docs/v2/02-video-transport.md). Dragging seeks inside that
 * file; letting go switches to the real recording.
 */
const props = defineProps({
  previews: { type: Array, default: () => [] },
  ts: { type: Number, required: true },
});

const video = ref(null);
let loadedUrl = null;

function previewFor(ts) {
  return props.previews.find((preview) => ts >= Date.parse(preview.start) && ts < Date.parse(preview.end)) ?? null;
}

watch(
    () => props.ts,
    (ts) => {
      const el = video.value;
      const preview = previewFor(ts);
      if (!el || !preview) return;

      if (preview.preview_url !== loadedUrl) {
        loadedUrl = preview.preview_url;
        el.src = preview.preview_url;
        el.load();
      }

      const seek = () => {
        if (!el.duration || Number.isNaN(el.duration)) return;
        el.currentTime = previewFraction(ts, preview) * el.duration;
      };

      // Seeking before the duration is known is silently ignored.
      if (el.readyState >= 1) {
        seek();
      } else {
        el.addEventListener('loadedmetadata', seek, { once: true });
      }
    },
    { immediate: true },
);
</script>

<style scoped>
.preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}
</style>
