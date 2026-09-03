<template>
  <video ref="video" class="recording" controls playsinline preload="metadata"></video>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue';

/**
 * Plays the actual recording once the finger lifts.
 *
 * Two source shapes, because Frigate serves both: an HLS playlist for continuous recording
 * (`/vod/...`) and a plain mp4 for a clip. hls.js is loaded only when a playlist turns up.
 */
const video = ref(null);
let hls = null;

async function play(url, offsetSeconds = 0) {
  const el = video.value;
  if (!el || !url) return;

  await teardown();

  if (url.includes('.m3u8')) {
    const { default: Hls } = await import('hls.js');
    if (Hls.isSupported()) {
      hls = new Hls({ startPosition: offsetSeconds });
      hls.loadSource(url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => el.play().catch(() => {}));
      return;
    }
  }

  el.src = url;
  const start = () => {
    if (offsetSeconds > 0 && Number.isFinite(el.duration)) {
      el.currentTime = Math.min(offsetSeconds, el.duration - 0.25);
    }
    el.play().catch(() => {});
  };

  if (el.readyState >= 1) start();
  else el.addEventListener('loadedmetadata', start, { once: true });
}

async function teardown() {
  hls?.destroy();
  hls = null;

  const el = video.value;
  if (!el) return;
  el.pause();
  el.removeAttribute('src');
  el.load();
}

onBeforeUnmount(teardown);

defineExpose({ play, stop: teardown });
</script>

<style scoped>
.recording {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #000;
}
</style>
