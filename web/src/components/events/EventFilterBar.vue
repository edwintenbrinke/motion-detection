<template>
  <div class="filters">
    <div class="row">
      <div class="search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <input
            :value="query"
            type="search"
            placeholder="Zoeken in beschrijvingen"
            aria-label="Zoeken"
            @input="onSearch($event.target.value)"
        />
      </div>
      <button
          type="button"
          class="icon-button"
          :class="{ on: expanded || hasActiveFilters }"
          :aria-expanded="expanded"
          aria-label="Filters"
          @click="expanded = !expanded"
      >
        <i class="pi pi-filter" aria-hidden="true"></i>
      </button>
    </div>

    <div class="chips">
      <button
          type="button"
          class="chip"
          :class="{ on: filters.severity === 'alert' }"
          @click="toggleAlerts"
      >Alleen alerts</button>

      <button
          v-for="camera in cameras"
          :key="camera.name"
          type="button"
          class="chip"
          :class="{ on: filters.cameras.includes(camera.name) }"
          @click="toggleIn('cameras', camera.name)"
      >{{ camera.display_name }}</button>

      <button v-if="hasActiveFilters" type="button" class="chip clear" @click="$emit('clear')">
        <i class="pi pi-times" aria-hidden="true"></i> Wissen
      </button>
    </div>

    <div v-if="expanded" class="expanded">
      <p class="group-label">Wat</p>
      <div class="chips">
        <button
            v-for="label in labelOptions"
            :key="label.value"
            type="button"
            class="chip"
            :class="{ on: filters.labels.includes(label.value) }"
            @click="toggleIn('labels', label.value)"
        >{{ label.text }}</button>
      </div>

      <p class="group-label">Waar</p>
      <div class="chips">
        <button
            v-for="zone in zoneOptions"
            :key="zone"
            type="button"
            class="chip"
            :class="{ on: filters.zones.includes(zone) }"
            @click="toggleIn('zones', zone)"
        >{{ zone }}</button>
      </div>

      <p class="group-label">Wanneer</p>
      <div class="dates">
        <label>
          <span>Van</span>
          <input type="date" :value="dateOnly(filters.from)" @change="onDate('from', $event.target.value)" />
        </label>
        <label>
          <span>Tot</span>
          <input type="date" :value="dateOnly(filters.to)" @change="onDate('to', $event.target.value)" />
        </label>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { LABELS_NL } from '@/lib/vocabulary.js';

const props = defineProps({
  filters: { type: Object, required: true },
  cameras: { type: Array, default: () => [] },
  zoneOptions: { type: Array, default: () => ['pad', 'straat', 'tuin'] },
  hasActiveFilters: { type: Boolean, default: false },
});

const emit = defineEmits(['change', 'clear']);

const expanded = ref(false);

const labelOptions = computed(() =>
    ['person', 'car', 'bicycle', 'motorcycle', 'dog', 'cat'].map((value) => ({ value, text: LABELS_NL[value] })),
);

const query = computed(() => props.filters.q ?? '');

let searchTimer = null;

/**
 * Debounced: the search box drives a network request per keystroke otherwise, and the
 * feed reloads from the top each time.
 */
function onSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => emit('change', { q: value.trim() || null }), 350);
}

function toggleAlerts() {
  emit('change', { severity: props.filters.severity === 'alert' ? null : 'alert' });
}

function toggleIn(key, value) {
  const current = props.filters[key];
  emit('change', {
    [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
  });
}

const dateOnly = (value) => (value ? value.slice(0, 10) : '');

function onDate(key, value) {
  if (!value) {
    emit('change', { [key]: null });
    return;
  }
  // `from` starts the day, `to` ends it -- otherwise picking one day returns nothing.
  const iso = key === 'from' ? `${value}T00:00:00` : `${value}T23:59:59`;
  emit('change', { [key]: new Date(iso).toISOString() });
}
</script>

<style scoped>
.filters {
  padding: var(--app-space-2) var(--app-space-4) var(--app-space-3);
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
}

.row {
  display: flex;
  gap: var(--app-space-2);
  margin-bottom: var(--app-space-2);
}

.search {
  position: relative;
  flex: 1;
}

.search i {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--app-text-faint);
  font-size: 13px;
}

.search input {
  width: 100%;
  padding: 8px 10px 8px 30px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
}

.search input::placeholder {
  color: var(--app-text-faint);
}

.icon-button {
  display: grid;
  place-items: center;
  width: 36px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-text-muted);
  cursor: pointer;
}

.icon-button.on {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text-muted);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.chip.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.chip.clear {
  border-color: transparent;
  color: var(--app-text-faint);
}

.expanded {
  margin-top: var(--app-space-3);
}

.group-label {
  margin: var(--app-space-3) 0 6px;
  color: var(--app-text-faint);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dates {
  display: flex;
  gap: var(--app-space-3);
}

.dates label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--app-text-muted);
  font-size: 12px;
}

.dates input {
  padding: 7px 9px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
}
</style>
