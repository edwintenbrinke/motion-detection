<template>
  <div ref="root" class="detail">
    <header class="bar">
      <button type="button" class="icon" aria-label="Terug" @click="goBack">
        <i class="pi pi-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="bar-title">{{ event ? cameraNl(event.camera) : 'Event' }}</span>
      <button type="button" class="icon" aria-label="Delen" :disabled="!event" @click="share">
        <i class="pi pi-share-alt" aria-hidden="true"></i>
      </button>
    </header>

    <template v-if="event">
      <VideoPlayer
          v-if="event.has_clip"
          :src="event.media.clip"
          :poster="event.media.snapshot"
          :expires-at="event.media.expires_at"
          @expired="onMediaExpired"
          @retry="onMediaExpired"
      />
      <div v-else class="still">
        <img v-if="event.media.snapshot" :src="event.media.snapshot" alt="Snapshot van dit event" />
        <p class="no-clip">Geen clip, alleen een stilstaand beeld</p>
      </div>

      <nav class="pager">
        <button type="button" :disabled="!previousId" @click="goToSibling(previousId)">
          <i class="pi pi-chevron-left" aria-hidden="true"></i> Nieuwer
        </button>
        <span class="position">{{ position }}</span>
        <button type="button" :disabled="!nextId" @click="goToSibling(nextId)">
          Ouder <i class="pi pi-chevron-right" aria-hidden="true"></i>
        </button>
      </nav>

      <section class="summary">
        <div class="headline-row">
          <h1>{{ headline(event) }}</h1>
          <span class="severity" :class="event.severity">{{ severityLabel(event) }}</span>
        </div>

        <p class="when">{{ formatDayHeading(event.started_at) }} · {{ formatTimeSeconds(event.started_at) }}</p>

        <p v-if="event.description" class="description">{{ event.description }}</p>

        <div v-if="allChips.length" class="chips">
          <span v-for="chip in allChips" :key="chip.key" class="chip" :class="chip.kind">{{ chip.text }}</span>
        </div>
      </section>

      <dl class="facts">
        <div v-if="event.duration_s !== null">
          <dt>Duur</dt>
          <dd>{{ formatDuration(event.duration_s) }}</dd>
        </div>
        <div v-if="event.top_score !== null">
          <dt>Zekerheid</dt>
          <dd>{{ Math.round(event.top_score * 100) }} %</dd>
        </div>
        <div v-if="genaiSeverity">
          <dt>Beoordeling</dt>
          <dd :class="`genai-${event.genai_severity}`">{{ genaiSeverity }}</dd>
        </div>
        <div>
          <dt>Camera</dt>
          <dd>{{ cameraNl(event.camera) }}</dd>
        </div>
      </dl>

      <div class="feedback">
        <button v-if="!feedbackSent" type="button" class="wrong" @click="feedbackOpen = true">
          <i class="pi pi-flag" aria-hidden="true"></i> Dit klopt niet
        </button>
        <p v-else class="thanks">
          <i class="pi pi-check" aria-hidden="true"></i> Bedankt, dat helpt de herkenning
        </p>
      </div>

      <FeedbackDialog
          v-if="feedbackOpen"
          :sending="feedbackSending"
          @close="feedbackOpen = false"
          @submit="submitFeedback"
      />
    </template>

    <EmptyState
        v-else-if="loadError"
        icon="pi pi-exclamation-triangle"
        title="Event laden lukt niet"
        :description="loadError.message"
    >
      <button type="button" class="retry" @click="load">Opnieuw proberen</button>
    </EmptyState>

    <div v-else class="loading">
      <div class="skeleton-player"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useNotify } from '@/composables/useNotify.js';
import { useEventsStore } from '@/stores/events';
import { formatTimeSeconds, formatDayHeading, formatDuration } from '@/lib/datetime.js';
import { headline, chips, cameraNl, severityLabel, genaiSeverityNl } from '@/lib/eventPresenter.js';
import VideoPlayer from '@/components/player/VideoPlayer.vue';
import FeedbackDialog from '@/components/events/FeedbackDialog.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { useSwipe } from '@/composables/useSwipe.js';

/** The public host, for share links. A signed clip URL is never shared: it dies in 10 min. */
const APP_LINK_BASE = 'https://motion.edwintenbrinke.nl';

const route = useRoute();
const router = useRouter();
const store = useEventsStore();
const notify = useNotify();

const root = ref(null);
const loadError = ref(null);
const feedbackOpen = ref(false);
const feedbackSending = ref(false);
const feedbackSent = ref(false);

const eventId = computed(() => String(route.params.id));
const event = computed(() => store.byId(eventId.value));

const allChips = computed(() => (event.value ? chips(event.value) : []));
const genaiSeverity = computed(() => genaiSeverityNl(event.value?.genai_severity));

// Siblings follow the feed's order, so "ouder" really is the next one down the list.
const index = computed(() => store.indexOf(eventId.value));
const previousId = computed(() => (index.value > 0 ? store.events[index.value - 1].id : null));
const nextId = computed(() =>
    index.value >= 0 && index.value < store.events.length - 1 ? store.events[index.value + 1].id : null,
);
const position = computed(() =>
    index.value >= 0 ? `${index.value + 1} van ${store.events.length}` : '',
);

async function load() {
  loadError.value = null;
  feedbackSent.value = false;

  try {
    // Already in the feed? Still fetch, because a card carries no fresher media than the
    // page it arrived on, and the player needs a URL that has not expired.
    await store.loadOne(eventId.value);
    await store.ensureFreshMedia(eventId.value);
    store.markSeen(eventId.value).catch(() => {});
  } catch (error) {
    loadError.value = error;
  }
}

/** The player could not use its URL. Re-sign and hand it back a new one. */
async function onMediaExpired() {
  await store.ensureFreshMedia(eventId.value, { force: true });
}

function goBack() {
  if (window.history.state?.back) {
    router.back();
  } else {
    // Opened straight from a notification: there is no history to go back to.
    router.replace('/events');
  }
}

function goToSibling(id) {
  if (id) router.replace(`/events/${encodeURIComponent(id)}`);
}

async function share() {
  const url = `${APP_LINK_BASE}/event/${encodeURIComponent(eventId.value)}`;
  const title = event.value ? headline(event.value) : 'Motion event';

  try {
    await Share.share({ title, text: title, url, dialogTitle: 'Event delen' });
  } catch (error) {
    // Not available in a plain browser, and the user cancelling also lands here.
    if (error?.message?.includes('canceled') || error?.message?.includes('cancelled')) return;
    try {
      await navigator.clipboard.writeText(url);
      notify.success('Link gekopieerd');
    } catch {
      notify.warn('Delen lukt hier niet');
    }
  }
}

async function submitFeedback(payload) {
  feedbackSending.value = true;
  try {
    await store.sendFeedback(eventId.value, payload);
    feedbackSent.value = true;
    feedbackOpen.value = false;
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    notify.success('Bedankt', 'Je correctie is opgeslagen.');
  } catch (error) {
    notify.error('Versturen mislukt', error?.message);
  } finally {
    feedbackSending.value = false;
  }
}

// Swipe is wired directly to the pager, so the gesture and the buttons cannot disagree.
useSwipe(root, {
  onLeft: () => goToSibling(nextId.value),
  onRight: () => goToSibling(previousId.value),
});

watch(eventId, load);
onMounted(load);
</script>

<style scoped>
.detail {
  padding-top: var(--app-safe-top);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--app-space-2);
  padding: var(--app-space-2) var(--app-space-2);
}

.bar-title {
  flex: 1;
  font-weight: 600;
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
  -webkit-tap-highlight-color: transparent;
}

.icon:active {
  background: var(--app-surface-hover);
}

.icon:disabled {
  opacity: 0.4;
}

.still {
  position: relative;
  background: #000;
}

.still img {
  width: 100%;
  display: block;
}

.no-clip {
  margin: 0;
  padding: var(--app-space-2) var(--app-space-4);
  color: var(--app-text-muted);
  font-size: 13px;
  text-align: center;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--app-space-2) var(--app-space-3);
  border-bottom: 1px solid var(--app-border);
}

.pager button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.pager button:disabled {
  color: var(--app-text-faint);
  cursor: default;
}

.position {
  color: var(--app-text-faint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.summary {
  padding: var(--app-space-4);
}

.headline-row {
  display: flex;
  align-items: flex-start;
  gap: var(--app-space-2);
}

.headline-row h1 {
  flex: 1;
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  line-height: 1.3;
}

.severity {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.severity.alert {
  background: var(--app-alert-dim);
  color: var(--app-alert);
}

.severity.detection {
  background: var(--app-detection-dim);
  color: var(--app-detection);
}

.when {
  margin: var(--app-space-1) 0 0;
  color: var(--app-text-muted);
  font-size: 13px;
}

.description {
  margin: var(--app-space-3) 0 0;
  line-height: 1.5;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: var(--app-space-3);
}

.chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--app-surface-raised);
  color: var(--app-text-muted);
  font-size: 12px;
}

.chip.zone {
  background: var(--app-detection-dim);
  color: var(--app-detection);
}

.chip.tag {
  background: rgba(242, 177, 52, 0.12);
  color: var(--app-accent);
}

.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  margin: 0;
  padding: 0;
  background: var(--app-border);
  border-top: 1px solid var(--app-border);
  border-bottom: 1px solid var(--app-border);
}

.facts > div {
  padding: var(--app-space-3) var(--app-space-4);
  background: var(--app-surface);
}

/* Not every event has a GenAI verdict or a score, so the count varies. An odd last item
   spans the row rather than leaving a hole that reads as a rendering fault. */
.facts > div:last-child:nth-child(odd) {
  grid-column: 1 / -1;
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

.genai-suspicious { color: var(--app-accent); }
.genai-dangerous { color: var(--app-alert); }

.feedback {
  padding: var(--app-space-4);
}

.wrong {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  width: 100%;
  padding: 11px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.thanks {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-2);
  margin: 0;
  color: var(--app-success);
  font-size: 14px;
}

.loading .skeleton-player {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--app-surface-raised);
}

.retry {
  margin-top: var(--app-space-3);
  padding: 8px 16px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  cursor: pointer;
}
</style>
