<template>
  <div class="timeline">
    <header class="header">
      <h1>Tijdlijn</h1>
      <input class="date" type="date" :value="date" :max="today" @change="onDateChange" />
    </header>

    <!-- Only worth the row when there is a choice to make. -->
    <div v-if="cameras.length > 1" class="cameras">
      <button
          v-for="option in cameras"
          :key="option.name"
          type="button"
          class="chip"
          :class="{ on: option.name === camera }"
          @click="selectCamera(option.name)"
      >{{ option.display_name }}</button>
    </div>

    <!--
      Live is torn down when you leave it -- a stream nobody is watching should stop. The
      other two stay mounted and are shown or hidden, so a drag does not throw away the
      preview hour it just downloaded (docs/v2/13-timeline-and-players.md#a3).
    -->
    <div class="stage">
      <LivePlayer v-if="mode === 'live'" :camera="camera" />

      <div v-show="mode === 'scrub'" class="surface">
        <TimelinePreview :previews="day.previews" :ts="centerTs" :active="mode === 'scrub'" />
      </div>

      <div v-show="mode === 'recording'" class="surface">
        <VideoPlayer
            :hls-src="playback.url"
            :start-at="playback.offset"
            :expires-at="day.expires_at"
            :active="mode === 'recording'"
            :autoplay="mode === 'recording'"
            error-text="Opname niet beschikbaar"
            @expired="reloadAndResume"
            @retry="reloadAndResume"
            @stream-error="onStreamError"
            @ended="onWindowEnded"
        />
      </div>

      <div v-if="mode === 'recording' && !playback.url" class="gap">
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
          <span class="marker-time">{{ formatTime(event.start_ms) }}</span>
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
import { timelineVodUrl, DEFAULT_VOD_WINDOW_S } from '@/api/contract.js';
import { rangeAt, vodWindow, HOUR_MS, DAY_MS, MINUTE_MS } from '@/components/timeline/useTimelineGeometry.js';
import TimelineStrip from '@/components/timeline/TimelineStrip.vue';
import TimelinePreview from '@/components/timeline/TimelinePreview.vue';
import VideoPlayer from '@/components/player/VideoPlayer.vue';
import LivePlayer from '@/components/live/LivePlayer.vue';

const router = useRouter();

const cameras = ref([]);
const camera = ref('');
const date = ref(toDateKey(Date.now()));
const today = toDateKey(Date.now());

const day = ref({ vod: null, recordings: [], previews: [], events: [] });
const loading = ref(false);
const loadError = ref(null);

const centerTs = ref(Date.now());
const windowMs = ref(HOUR_MS);
/** 'live' while following now, 'scrub' during a drag, 'recording' after letting go. */
const mode = ref('live');
/**
 * What the player is pointed at: one bounded window inside the span under the playhead, the
 * offset into that window, and the span it came from.
 *
 * Set on release rather than computed from `centerTs`, deliberately. A computed source would
 * hand the player a new URL on every pointermove of a drag -- A3's seek storm arriving by a
 * different route (docs/v2/13-timeline-and-players.md#a3).
 *
 * The player is prop-driven, so the position is state here rather than an imperative
 * `play(url, offset)` call -- which is what let the timeline and the event page end up as
 * one component instead of two.
 */
const playback = ref({ url: null, offset: 0, window: null, range: null });
/**
 * Which width in `vodWindows` is being tried. Reset on every release; stepped once by
 * `onStreamError`, which is the timeline's fallback for a playlist the server would not
 * build.
 */
let windowAttempt = 0;
/** The timestamp the current playback was asked for, so a retry can ask for it again. */
let playbackTs = 0;

const dayStart = computed(() => new Date(`${date.value}T00:00:00`).getTime());
const dayEnd = computed(() => Math.min(dayStart.value + DAY_MS, Date.now()));

/**
 * The window widths to try, widest first: what the API asked for, then a quarter of it.
 *
 * A playlist is built per request out of one entry per ten-second recording segment, and
 * the wider the range the more ways that has to fail -- Frigate caps the mapping it will
 * assemble, and a big one is slow before it is anything else. So a fatal error is worth one
 * narrower attempt before it is worth an error panel.
 */
const vodWindows = computed(() => {
  const base = (day.value.vod?.window_s ?? DEFAULT_VOD_WINDOW_S) * 1000;
  return [base, Math.max(MINUTE_MS, Math.round(base / 4))];
});

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
      .filter((event) => Math.abs(event.start_ms - centerTs.value) <= half)
      .slice(0, 12);
});

async function load() {
  if (!camera.value) return;

  loading.value = true;
  loadError.value = null;

  try {
    day.value = await api.timeline.getDay(camera.value, date.value);
  } catch (error) {
    loadError.value = error;
    day.value = { vod: null, recordings: [], previews: [], events: [] };
  } finally {
    loading.value = false;
  }
}

/**
 * The camera list, rather than a hard-coded name. There is one camera today, which is why
 * the old constant was honest -- but the day the second one appears, a page that cannot
 * name it is a page that shows the wrong one.
 */
async function loadCameras() {
  try {
    cameras.value = await api.cameras.list();
  } catch {
    cameras.value = [];
  }
  camera.value = cameras.value[0]?.name ?? '';
}

function selectCamera(name) {
  if (name === camera.value) return;
  camera.value = name;
  mode.value = date.value === today ? 'live' : 'recording';
  load();
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
  windowAttempt = 0;
  playAt(ts);
  mode.value = 'recording';
}

/**
 * Point the player at the window covering `ts`. Setting `playback` is the whole of "start
 * playing here"; there is no imperative call into the player.
 */
function playAt(ts) {
  playbackTs = ts;

  const range = rangeAt(ts, day.value.recordings);
  if (!range) {
    playback.value = { url: null, offset: 0, window: null, range: null };
    return;
  }

  const width = vodWindows.value[windowAttempt] ?? vodWindows.value[0];
  // Not `window`: shadowing the global in a browser app is a trap waiting for the first
  // line that needs the real one.
  const slice = vodWindow(ts, range, width);

  playback.value = {
    url: timelineVodUrl(day.value.vod, slice.start_ms, slice.end_ms),
    offset: Math.max(0, (ts - slice.start_ms) / 1000),
    window: slice,
    range,
  };
}

/**
 * A dead playlist is not a dead recording, and the range is the likeliest reason for it.
 * Try a narrower window once; only a second failure is the player's to report, and by then
 * it has the server's own status to report it with.
 */
function onStreamError() {
  if (windowAttempt + 1 >= vodWindows.value.length) return;

  windowAttempt += 1;
  playAt(playbackTs);
}

/**
 * A window is a slice of a longer recording, so playing one out means "carry on into the
 * next slice" rather than "the recording ended".
 */
function onWindowEnded() {
  const { window: slice, range } = playback.value;
  if (!slice || !range || slice.end_ms >= range.end_ms) return;

  windowAttempt = 0;
  centerTs.value = slice.end_ms;
  playAt(slice.end_ms);
}

/**
 * A failed recording is almost always an expired signature, and only a fresh day response
 * re-signs it. So the retry reloads the day and picks playback up where it was, rather than
 * asking the player to try the same dead URL again.
 */
async function reloadAndResume() {
  const ts = centerTs.value;
  await load();
  onScrubEnd(ts);
}

// A day with different recordings is a different window; whatever was playing came from the
// old one and its signature is stale anyway.
watch(() => day.value, () => {
  if (mode.value === 'recording' && playbackTs > 0) {
    windowAttempt = 0;
    playAt(playbackTs);
  }
});

function goLive() {
  date.value = today;
  centerTs.value = Date.now();
  mode.value = 'live';
}

function openEvent(event) {
  router.push(`/events/${encodeURIComponent(event.id)}`);
}

watch(date, load);

onMounted(async () => {
  await loadCameras();
  await load();
});
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

/* Same chip as the events filter bar, so one selection idiom rather than two. */
.cameras {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 var(--app-space-4) var(--app-space-2);
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

.stage {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}

.surface {
  position: absolute;
  inset: 0;
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
