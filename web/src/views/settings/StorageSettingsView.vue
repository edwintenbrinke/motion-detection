<template>
  <AppScreen title="Opslag" back="/settings">
    <section class="block">
      <p class="block-title">Bewaartermijn</p>
      <p class="explain">
        Frigate ruimt zelf op. De app leest deze waarden alleen; ze staan in de
        Frigate-configuratie.
      </p>

      <dl v-if="cameras.length" class="facts">
        <template v-for="camera in cameras" :key="camera.name">
          <div>
            <dt>{{ camera.display_name ?? camera.name }} · alerts</dt>
            <dd>{{ retention(camera, 'alerts_days') }}</dd>
          </div>
          <div>
            <dt>{{ camera.display_name ?? camera.name }} · detecties</dt>
            <dd>{{ retention(camera, 'detections_days') }}</dd>
          </div>
        </template>
      </dl>
      <p v-else class="explain">Nog niet bekend.</p>
    </section>

    <section class="block">
      <p class="block-title">Op dit toestel</p>
      <p class="explain">
        De app bewaart alleen de laatste pagina van de feed, zodat je zonder verbinding nog
        ziet wat er was. Video's worden nooit lokaal opgeslagen.
      </p>

      <div class="row">
        <span>Bewaarde events</span>
        <span class="value">{{ cachedCount }}</span>
      </div>
      <div class="row">
        <span>Laatst bijgewerkt</span>
        <span class="value">{{ cachedAt ? formatRelative(cachedAt) : 'nooit' }}</span>
      </div>

      <button type="button" class="ghost" :disabled="clearing" @click="clear">
        {{ clearing ? 'Wissen…' : 'Lokale cache wissen' }}
      </button>
    </section>
  </AppScreen>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '@/api';
import { formatRelative } from '@/lib/datetime.js';
import { loadFeedCache } from '@/lib/feedCache.js';
import { useEventsStore } from '@/stores/events';
import { useInitializeStore } from '@/stores/initialize';
import { useVideoStore } from '@/stores/video';
import { useNotify } from '@/composables/useNotify.js';
import AppScreen from '@/components/ui/AppScreen.vue';

const notify = useNotify();
const eventsStore = useEventsStore();
const initStore = useInitializeStore();
const videoStore = useVideoStore();

const cameras = ref([]);
const cachedCount = ref(0);
const cachedAt = ref(null);
const clearing = ref(false);

function retention(camera, key) {
  const days = camera.retention?.[key];
  return days ? `${days} dagen` : 'onbekend';
}

async function readCache() {
  const cache = await loadFeedCache();
  cachedCount.value = cache?.events?.length ?? 0;
  cachedAt.value = cache?.fetched_at ?? null;
}

async function clear() {
  clearing.value = true;
  try {
    // Every local store, not just the feed: the point of this button is getting out of a
    // state where persisted data and the server disagree.
    await eventsStore.resetStore();
    videoStore.resetStore();
    initStore.resetStore();
    await readCache();
    notify.success('Cache gewist');
  } finally {
    clearing.value = false;
  }
}

onMounted(async () => {
  await readCache();
  try {
    cameras.value = await api.cameras.list();
  } catch {
    // Retention is informational; the cache section still works without it.
  }
});
</script>

<style scoped>
.block {
  padding: var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
}

.block-title {
  margin: 0 0 var(--app-space-2);
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.explain {
  margin: 0 0 var(--app-space-3);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--app-space-3);
  margin: 0;
}

.facts dt {
  color: var(--app-text-faint);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.facts dd {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 500;
}

.row {
  display: flex;
  justify-content: space-between;
  padding: 7px 0;
  font-size: 14px;
}

.value {
  color: var(--app-text-muted);
}

.ghost {
  width: 100%;
  margin-top: var(--app-space-3);
  padding: 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
</style>
