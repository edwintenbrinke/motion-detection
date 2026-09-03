<template>
  <div class="zones">
    <header class="bar">
      <button type="button" class="icon" aria-label="Terug" @click="$router.push('/settings')">
        <i class="pi pi-chevron-left" aria-hidden="true"></i>
      </button>
      <div class="tabs">
        <button type="button" :class="{ on: tab === 'zones' }" @click="tab = 'zones'">Zones</button>
        <button type="button" :class="{ on: tab === 'masks' }" @click="tab = 'masks'">Maskers</button>
      </div>
      <button type="button" class="icon" aria-label="Opslaan" :disabled="saving || !dirty" @click="save">
        <i class="pi pi-save" aria-hidden="true"></i>
      </button>
    </header>

    <ZoneCanvas
        ref="canvas"
        :image-url="imageUrl"
        :shapes="shapes"
        :active-index="activeIndex"
        @update:shapes="onShapesChange"
    />

    <p class="hint">
      {{ activeIndex >= 0
          ? 'Tik om een punt toe te voegen, sleep een genummerd punt om het te verplaatsen. De volgorde bepaalt de vorm.'
          : 'Kies hieronder een vorm om te bewerken, of maak er een aan.' }}
    </p>

    <div class="list">
      <div
          v-for="(shape, index) in shapes"
          :key="index"
          class="item"
          :class="{ on: index === activeIndex }"
          @click="activeIndex = index === activeIndex ? -1 : index"
      >
        <span class="swatch" :style="{ background: shape.color }"></span>
        <div class="item-body">
          <input
              class="name"
              :value="shape.name"
              :placeholder="tab === 'zones' ? 'Zonenaam' : 'Maskernaam'"
              @click.stop
              @input="rename(index, $event.target.value)"
          />
          <span class="meta">{{ shape.points?.length ?? 0 }} punten</span>

          <div v-if="tab === 'zones' && index === activeIndex" class="objects">
            <span class="objects-label">Telt mee voor</span>
            <button
                v-for="option in labelOptions"
                :key="option.value"
                type="button"
                class="chip"
                :class="{ on: (shape.objects ?? []).includes(option.value) }"
                @click.stop="toggleObject(index, option.value)"
            >{{ option.text }}</button>
          </div>
        </div>
        <button type="button" class="icon danger" aria-label="Verwijderen" @click.stop="remove(index)">
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="ghost" @click="add">
        <i class="pi pi-plus" aria-hidden="true"></i>
        {{ tab === 'zones' ? 'Zone toevoegen' : 'Masker toevoegen' }}
      </button>
      <button type="button" class="ghost" :disabled="activeIndex < 0" @click="$refs.canvas.undo()">
        <i class="pi pi-undo" aria-hidden="true"></i> Punt terug
      </button>
    </div>

    <p v-if="loadError" class="note error">{{ loadError.message }}</p>
    <p v-else class="note">
      Wijzigingen gaan naar Frigate en gelden binnen enkele seconden. Een zone met minder dan
      drie punten wordt niet opgeslagen.
    </p>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { api } from '@/api';
import { LABELS_NL } from '@/lib/vocabulary.js';
import { useNotify } from '@/composables/useNotify.js';
import ZoneCanvas from '@/components/zones/ZoneCanvas.vue';

const PALETTE = ['#f2b134', '#4f9bd9', '#6cc070', '#d95f8a', '#b07fd8', '#d9784f'];

const notify = useNotify();

const camera = ref('voordeur');
const tab = ref('zones');
const zones = ref([]);
const masks = ref([]);
const activeIndex = ref(-1);
const dirty = ref(false);
const saving = ref(false);
const loadError = ref(null);
const canvas = ref(null);

const imageUrl = computed(() => api.cameras.snapshotUrl(camera.value));
const shapes = computed(() => (tab.value === 'zones' ? zones.value : masks.value));

const labelOptions = computed(() =>
    ['person', 'car', 'bicycle', 'motorcycle', 'dog', 'cat'].map((value) => ({ value, text: LABELS_NL[value] })),
);

function setShapes(next) {
  if (tab.value === 'zones') zones.value = next;
  else masks.value = next;
}

function onShapesChange(next) {
  setShapes(next);
  dirty.value = true;
}

function add() {
  const next = [...shapes.value, {
    name: '',
    color: PALETTE[shapes.value.length % PALETTE.length],
    objects: tab.value === 'zones' ? ['person'] : [],
    points: [],
  }];
  setShapes(next);
  activeIndex.value = next.length - 1;
  dirty.value = true;
}

function remove(index) {
  setShapes(shapes.value.filter((_, i) => i !== index));
  if (activeIndex.value === index) activeIndex.value = -1;
  else if (activeIndex.value > index) activeIndex.value -= 1;
  dirty.value = true;
}

function rename(index, name) {
  setShapes(shapes.value.map((shape, i) => (i === index ? { ...shape, name } : shape)));
  dirty.value = true;
}

function toggleObject(index, value) {
  setShapes(shapes.value.map((shape, i) => {
    if (i !== index) return shape;
    const objects = shape.objects ?? [];
    return { ...shape, objects: objects.includes(value) ? objects.filter((o) => o !== value) : [...objects, value] };
  }));
  dirty.value = true;
}

async function load() {
  loadError.value = null;
  try {
    const [loadedZones, loadedMasks] = await Promise.all([
      api.zones.get(camera.value),
      api.zones.getMasks(camera.value),
    ]);
    zones.value = loadedZones;
    masks.value = loadedMasks;
    dirty.value = false;
  } catch (error) {
    loadError.value = error;
  }
}

async function save() {
  // A polygon needs three points to enclose anything, and an invalid config makes Frigate
  // refuse to start -- recovering from which means shelling into a pod.
  const usable = shapes.value.filter((shape) => (shape.points?.length ?? 0) >= 3 && shape.name.trim());
  const dropped = shapes.value.length - usable.length;

  saving.value = true;
  try {
    if (tab.value === 'zones') await api.zones.put(camera.value, usable);
    else await api.zones.putMasks(camera.value, usable);

    setShapes(usable);
    dirty.value = false;
    notify.success('Opgeslagen', dropped > 0 ? `${dropped} onvolledige vorm overgeslagen.` : undefined);
  } catch (error) {
    notify.error('Opslaan mislukt', error?.message);
  } finally {
    saving.value = false;
  }
}

watch(tab, () => {
  activeIndex.value = -1;
});

onMounted(load);
</script>

<style scoped>
.zones {
  padding-top: var(--app-safe-top);
  padding-bottom: var(--app-space-6);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-2);
}

.tabs {
  flex: 1;
  display: flex;
  gap: 6px;
  justify-content: center;
}

.tabs button {
  padding: 5px 14px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.tabs button.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.icon {
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

.icon:disabled {
  opacity: 0.35;
}

.icon.danger {
  color: var(--app-alert);
  font-size: 14px;
}

.hint,
.note {
  margin: var(--app-space-3) var(--app-space-4);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.note.error {
  color: var(--app-alert);
}

.list {
  border-top: 1px solid var(--app-border);
}

.item {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4);
  border-bottom: 1px solid var(--app-border);
  background: var(--app-surface);
  cursor: pointer;
}

.item.on {
  background: var(--app-surface-hover);
}

.swatch {
  width: 12px;
  height: 12px;
  margin-top: 5px;
  border-radius: 3px;
  flex: none;
}

.item-body {
  flex: 1;
  min-width: 0;
}

.name {
  width: 100%;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 15px;
  font-weight: 600;
}

.name:focus {
  outline: none;
  border-bottom: 1px solid var(--app-accent);
}

.meta {
  color: var(--app-text-faint);
  font-size: 12px;
}

.objects {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: var(--app-space-2);
}

.objects-label {
  color: var(--app-text-faint);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  width: 100%;
}

.chip {
  padding: 3px 9px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chip.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.actions {
  display: flex;
  gap: var(--app-space-2);
  padding: var(--app-space-3) var(--app-space-4);
}

.ghost {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.ghost:disabled {
  opacity: 0.4;
}
</style>
