<template>
  <div class="live">
    <header class="header">
      <h1>Live</h1>
      <button
          v-if="canRotate"
          type="button"
          class="rotate"
          :aria-label="landscape ? 'Terug naar staand' : 'Draai naar liggend'"
          @click="toggleOrientation"
      >
        <i class="pi pi-mobile" aria-hidden="true"></i>
      </button>
    </header>

    <nav v-if="cameras.length > 1" class="cameras">
      <button
          v-for="camera in cameras"
          :key="camera.name"
          type="button"
          class="camera-tab"
          :class="{ on: camera.name === active }"
          @click="active = camera.name"
      >{{ camera.display_name }}</button>
    </nav>

    <LivePlayer v-if="active" ref="player" :camera="active" @snapshot="takeSnapshot" @state="onState" />

    <p class="explain">{{ explanation }}</p>

    <div v-if="snapshot" class="snapshot-sheet" @click.self="snapshot = null">
      <div class="sheet">
        <img :src="snapshot" alt="Snapshot" />
        <div class="sheet-actions">
          <button type="button" class="ghost" @click="snapshot = null">Sluiten</button>
          <button type="button" class="primary" @click="shareSnapshot">Delen</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Capacitor } from '@capacitor/core';
import { useToast } from 'primevue/usetoast';
import { api } from '@/api';
import { cameraNl } from '@/lib/eventPresenter.js';
import LivePlayer from '@/components/live/LivePlayer.vue';

const toast = useToast();

const cameras = ref([]);
const active = ref(null);
const player = ref(null);
const snapshot = ref(null);
const state = ref({ phase: 'idle', rung: null });
const landscape = ref(false);

const canRotate = computed(() => Capacitor.isNativePlatform?.() ?? false);

/**
 * Naming the rung is not enough on its own -- "MSE" means nothing to someone standing at
 * their own front door. This says why, in words, so a remote session reads as normal rather
 * than as a degraded one.
 */
const explanation = computed(() => {
  switch (state.value.rung?.type) {
    case 'webrtc':
      return 'Directe verbinding via het thuisnetwerk. Vrijwel geen vertraging.';
    case 'mse':
      return 'Verbonden van buitenaf. Ongeveer een seconde vertraging, dat is normaal.';
    case 'hls':
      return 'Het netwerk laat geen snellere verbinding toe. Enkele seconden vertraging.';
    case 'snapshot':
      return 'Alleen stilstaande beelden: er komt geen videoverbinding tot stand.';
    case 'file':
      return 'Demobeeld uit de mock-data. Er is geen echte camera aangesloten.';
    default:
      return state.value.phase === 'exhausted'
          ? 'Geen van de verbindingsmethodes werkte.'
          : 'Verbinding zoeken…';
  }
});

function onState(next) {
  state.value = next;
}

async function takeSnapshot() {
  const source = player.value?.currentSource();
  const rung = source?.rungs?.find((candidate) => candidate.type === 'snapshot');

  if (!rung?.url) {
    toast.add({ severity: 'warn', summary: 'Snapshot niet beschikbaar', life: 2500 });
    return;
  }

  const separator = rung.url.includes('?') ? '&' : '?';
  snapshot.value = rung.url.startsWith('data:') ? rung.url : `${rung.url}${separator}t=${Date.now()}`;
}

async function shareSnapshot() {
  try {
    await navigator.clipboard.writeText(snapshot.value);
    toast.add({ severity: 'success', summary: 'Link gekopieerd', life: 2000 });
  } catch {
    toast.add({ severity: 'warn', summary: 'Delen lukt hier niet', life: 2500 });
  }
}

/**
 * Landscape is a deliberate button rather than an orientation listener: an app that rotates
 * itself when you lie down in bed is an app people complain about.
 */
async function toggleOrientation() {
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    if (landscape.value) {
      await ScreenOrientation.unlock();
      landscape.value = false;
    } else {
      await ScreenOrientation.lock({ orientation: 'landscape' });
      landscape.value = true;
    }
  } catch {
    toast.add({ severity: 'warn', summary: 'Draaien lukt hier niet', life: 2000 });
  }
}

onMounted(async () => {
  try {
    const list = await api.cameras.list();
    cameras.value = list.map((camera) => ({ ...camera, display_name: camera.display_name ?? cameraNl(camera.name) }));
    active.value = cameras.value[0]?.name ?? null;
  } catch {
    // One camera is the normal case; carry on with the default rather than a blank screen.
    active.value = 'voordeur';
  }
});

onBeforeUnmount(async () => {
  if (!landscape.value) return;
  try {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.unlock();
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
.live {
  padding-top: var(--app-safe-top);
}

.header {
  display: flex;
  align-items: center;
  padding: var(--app-space-3) var(--app-space-4) var(--app-space-2);
}

.header h1 {
  flex: 1;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.rotate {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--app-text);
  font-size: 16px;
  cursor: pointer;
}

.cameras {
  display: flex;
  gap: 6px;
  padding: 0 var(--app-space-4) var(--app-space-2);
}

.camera-tab {
  padding: 5px 12px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.camera-tab.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.explain {
  margin: var(--app-space-3) var(--app-space-4);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.snapshot-sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--app-space-4);
  background: rgba(0, 0, 0, 0.75);
}

.sheet {
  width: 100%;
  max-width: 560px;
}

.sheet img {
  width: 100%;
  border-radius: var(--app-radius);
  display: block;
}

.sheet-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--app-space-2);
  margin-top: var(--app-space-3);
}

.sheet-actions button {
  padding: 9px 18px;
  border-radius: var(--app-radius-sm);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.ghost {
  border: 1px solid var(--app-border-strong);
  background: transparent;
  color: #fff;
}

.primary {
  border: none;
  background: var(--app-accent);
  color: #1a1206;
  font-weight: 600;
}
</style>
