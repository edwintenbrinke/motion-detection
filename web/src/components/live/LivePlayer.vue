<template>
  <div ref="stage" class="stage">
    <video
        ref="video"
        class="surface"
        :class="{ hidden: showingImage }"
        muted
        playsinline
        autoplay
    ></video>

    <img ref="image" class="surface" :class="{ hidden: !showingImage }" alt="Laatste camerabeeld" />

    <div v-if="!hasPicture" class="placeholder">
      <i class="pi pi-video" aria-hidden="true"></i>
    </div>

    <LiveRungBadge class="badge-position" :state="state" />

    <div class="controls">
      <button type="button" aria-label="Snapshot maken" @click="$emit('snapshot')">
        <i class="pi pi-camera" aria-hidden="true"></i>
      </button>
      <button type="button" aria-label="Volledig scherm" @click="toggleFullscreen">
        <i class="pi pi-window-maximize" aria-hidden="true"></i>
      </button>
    </div>

    <div v-if="state.phase === 'exhausted'" class="failed">
      <p>Geen verbinding met de camera</p>
      <button type="button" @click="restart">Opnieuw proberen</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, onMounted, onBeforeUnmount, watch } from 'vue';
import { api } from '@/api';
import { createLivePlayer, IMAGE_RUNGS } from '@/lib/live/index.js';
import { isMediaStale } from '@/api/contract.js';
import { useAppLifecycle } from '@/composables/useAppLifecycle.js';
import LiveRungBadge from './LiveRungBadge.vue';

const props = defineProps({
  camera: { type: String, required: true },
});

const emit = defineEmits(['snapshot', 'state']);

const stage = ref(null);
const video = ref(null);
const image = ref(null);

const state = ref({ phase: 'idle', rung: null, rungIndex: -1, attempt: 0, error: null });
const ladder = shallowRef(null);
const source = shallowRef(null);

const showingImage = computed(() => IMAGE_RUNGS.has(state.value.rung?.type));
const hasPicture = computed(() => state.value.phase === 'playing' || state.value.phase === 'stalled');

async function loadSource() {
  source.value = await api.live.getSource(props.camera);
  return source.value;
}

async function connect() {
  await teardown();

  let current = source.value;
  // The rung URLs are signed like any other media, so a session resumed after a while
  // needs new ones before it can connect at all.
  if (!current || isMediaStale({ expires_at: current.expires_at })) {
    current = await loadSource();
  }

  if (!current?.rungs?.length) {
    state.value = { phase: 'exhausted', rung: null, rungIndex: -1, attempt: 0, error: new Error('Geen bronnen') };
    emit('state', state.value);
    return;
  }

  ladder.value = createLivePlayer({
    rungs: current.rungs,
    videoEl: video.value,
    imgEl: image.value,
    onState: (next) => {
      state.value = next;
      emit('state', next);
    },
  });

  await ladder.value.start();
}

async function teardown() {
  if (ladder.value) {
    await ladder.value.stop();
    ladder.value = null;
  }
}

async function restart() {
  // Force a re-fetch: whatever went wrong may have been the source, not the transport.
  source.value = null;
  await connect();
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stage.value?.requestFullscreen();
    }
  } catch {
    // Refused or unsupported; nothing useful to tell the user about it.
  }
}

/**
 * A WebRTC session running behind a locked screen is battery and bandwidth spent on nobody.
 * docs/v2/05-android-app.md calls this out explicitly, and it is the one part of the live
 * view that is easy to forget and expensive to get wrong.
 */
const lifecycle = useAppLifecycle({
  onBackground: teardown,
  onForeground: connect,
});

watch(() => props.camera, restart);

onMounted(connect);

/**
 * A page refresh does not reliably run onBeforeUnmount, so the WebSocket is left for the
 * browser to reap. go2rtc keeps that consumer for a moment, and the next page load gets a
 * backlog of fragments the instant it connects -- which is the difference between the first
 * load being smooth and every one after it stuttering. `pagehide` fires on refresh, on
 * navigation and on the bfcache path, which none of the alternatives manage together.
 */
function closeOnUnload() {
  teardown();
}
window.addEventListener('pagehide', closeOnUnload);

onBeforeUnmount(async () => {
  window.removeEventListener('pagehide', closeOnUnload);
  lifecycle.stop();
  await teardown();
});

defineExpose({ restart, currentSource: () => source.value });
</script>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
}

.surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.hidden {
  visibility: hidden;
}

.placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--app-text-faint);
  font-size: 30px;
}

.badge-position {
  position: absolute;
  top: var(--app-space-3);
  left: var(--app-space-3);
}

.controls {
  position: absolute;
  right: var(--app-space-3);
  bottom: var(--app-space-3);
  display: flex;
  gap: var(--app-space-2);
}

.controls button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.failed {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--app-space-3);
  background: rgba(0, 0, 0, 0.7);
  color: var(--app-text-muted);
}

.failed p {
  margin: 0;
}

.failed button {
  padding: 8px 16px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: #fff;
  font: inherit;
  cursor: pointer;
}
</style>
