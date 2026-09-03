<template>
  <div class="timeline">
    <header class="header">
      <h1>Tijdlijn</h1>
      <input class="date" type="date" :value="date" :max="today" @change="onDateChange" />
    </header>

    <div class="stage">
      <LivePlayer v-if="mode === 'live'" :camera="camera" />
      <TimelinePreview v-else-if="mode === 'scrub'" :previews="day.previews" :ts="centerTs" />
      <RecordingPlayer v-else ref="recording" />

      <div v-if="mode === 'recording' && !currentRange" class="gap">
        <i class="pi pi-video-slash" aria-hidden="true"></i>
        <p>Geen opname op dit moment</p>
      </div>
    </div>

    <div class="readout">
      <span class="clock">{{ formatTimeSeconds(centerTs) }}</span>
      <span class="zoom">{{ zoomLabel }}</span>
      <button type="button" class="now" :class="{ on: mode === 'live' }" @click="goLive">Nu</button>
    </div>

    <TimelineStrip
        :day-start="dayStart"
        :day-end="dayEnd"
        :center-ts="centerTs"
        :window-ms="windowMs"
        :recordings="day.recordings"
        :events="day.events"
        @update:centerTs="centerTs = $event"
        @update:windowMs="windowMs = $event"
        @scrub-start="onScrubStart"
        @scrub-end="onScrubEnd"
        @tap-event="openEvent"
    />

    <p v-if="loadError" class="note error">{{ loadError.message }}</p>
    <p v-else-if="loading" class="note">Tijdlijn laden…</p>
    <p v-else class="note">
      Sleep om terug te kijken, knijp om in of uit te zoomen. Tik een markering aan om dat
      event te openen.
    </p>

    <ul v-if="day.events.length" class="markers">
      <li v-for="event in nearbyEvents" :key="event.id">
        <button type="button" @click="openEvent(event)">
          <span class="marker-dot" :class="event.severity"></span>
          <span class="marker-time">{{ formatTime(event.start) }}</span>
          <span class="marker-label">{{ labelNl(event.label) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { formatTime, formatTimeSeconds, toDateKey } from '@/lib/datetime.js';
import { labelNl } from '@/lib/eventPresenter.js';
import { rangeAt, offsetInRange, HOUR_MS, DAY_MS, MINUTE_MS } from '@/components/timeline/useTimelineGeometry.js';
import TimelineStrip from '@/components/timeline/TimelineStrip.vue';
import TimelinePreview from '@/components/timeline/TimelinePreview.vue';
import RecordingPlayer from '@/components/timeline/RecordingPlayer.vue';
import LivePlayer from '@/components/live/LivePlayer.vue';

const router = useRouter();

const camera = ref('voordeur');
const date = ref(toDateKey(Date.now()));
const today = toDateKey(Date.now());

const day = ref({ recordings: [], previews: [], events: [] });
const loading = ref(false);
const loadError = ref(null);

const centerTs = ref(Date.now());
const windowMs = ref(HOUR_MS);
/** 'live' while following now, 'scrub' during a drag, 'recording' after letting go. */
const mode = ref('live');
const recording = ref(null);

const dayStart = computed(() => new Date(`${date.value}T00:00:00`).getTime());
const dayEnd = computed(() => Math.min(dayStart.value + DAY_MS, Date.now()));

const currentRange = computed(() => rangeAt(centerTs.value, day.value.recordings));

const zoomLabel = computed(() => {
  if (windowMs.value >= DAY_MS) return 'Dag';
  if (windowMs.value >= HOUR_MS) return `${Math.round(windowMs.value / HOUR_MS)} uur`;
  if (windowMs.value >= MINUTE_MS) return `${Math.round(windowMs.value / MINUTE_MS)} min`;
  return 'Seconden';
});

/** The handful of events around the playhead, as a tappable list under the strip. */
const nearbyEvents = computed(() => {
  const half = Math.max(windowMs.value, HOUR_MS) / 2;
  return day.value.events
      .filter((event) => Math.abs(Date.parse(event.start) - centerTs.value) <= half)
      .slice(0, 12);
});

async function load() {
  loading.value = true;
  loadError.value = null;

  try {
    day.value = await api.timeline.getDay(camera.value, date.value);
  } catch (error) {
    loadError.value = error;
    day.value = { recordings: [], previews: [], events: [] };
  } finally {
    loading.value = false;
  }
}

function onDateChange(event) {
  date.value = event.target.value;
  const isToday = date.value === today;
  centerTs.value = isToday ? Date.now() : dayStart.value + 12 * HOUR_MS;
  mode.value = isToday ? 'live' : 'recording';
}

function onScrubStart() {
  // Previews exist exactly so dragging does not stream the real recording.
  mode.value = 'scrub';
}

function onScrubEnd(ts) {
  const range = rangeAt(ts, day.value.recordings);
  mode.value = 'recording';

  if (!range) return;
  // The ref only exists after the mode switch renders the player.
  requestAnimationFrame(() => {
    recording.value?.play(range.vod_url, offsetInRange(ts, range));
  });
}

function goLive() {
  date.value = today;
  centerTs.value = Date.now();
  mode.value = 'live';
}

function openEvent(event) {
  router.push(`/events/${encodeURIComponent(event.id)}`);
}

watch(date, load);
onMounted(load);
</script>

<style scoped>
.timeline {
  padding-top: var(--app-safe-top);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-3) var(--app-space-4) var(--app-space-2);
}

.header h1 {
  flex: 1;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.date {
  padding: 6px 9px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface);
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
}

.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}

.gap {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--app-space-2);
  color: var(--app-text-faint);
}

.gap i {
  font-size: 26px;
}

.gap p {
  margin: 0;
  font-size: 14px;
}

.readout {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  padding: var(--app-space-2) var(--app-space-4);
}

.clock {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.zoom {
  color: var(--app-text-faint);
  font-size: 12px;
}

.now {
  padding: 5px 14px;
  border: 1px solid var(--app-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.now.on {
  border-color: var(--app-accent);
  background: rgba(242, 177, 52, 0.14);
  color: var(--app-accent);
}

.note {
  margin: var(--app-space-3) var(--app-space-4);
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.note.error {
  color: var(--app-alert);
}

.markers {
  margin: 0;
  padding: 0 0 var(--app-space-4);
  list-style: none;
}

.markers button {
  display: flex;
  align-items: center;
  gap: var(--app-space-3);
  width: 100%;
  padding: 9px var(--app-space-4);
  border: none;
  border-top: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.marker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-detection);
}

.marker-dot.alert {
  background: var(--app-alert);
}

.marker-time {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  color: var(--app-text-muted);
}

.marker-label {
  font-size: 14px;
}
</style>
