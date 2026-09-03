<template>
  <div class="events">
    <header class="header">
      <h1>Events</h1>
      <span v-if="store.unreadCount" class="unread">{{ store.unreadCount }} nieuw</span>
    </header>

    <EventFilterBar
        :filters="store.filters"
        :cameras="cameras"
        :has-active-filters="store.hasActiveFilters"
        @change="onFilterChange"
        @clear="onClearFilters"
    />

    <StaleBanner v-if="store.stale" :since="store.staleSince" @retry="reload" />

    <div v-if="pull.distance.value > 0 || pull.refreshing.value" class="pull" :style="{ height: `${pull.distance.value}px` }">
      <i class="pi pi-refresh" :class="{ spin: pull.refreshing.value }" aria-hidden="true"></i>
    </div>

    <button v-if="store.newCount" type="button" class="new-pill" @click="showNew">
      <i class="pi pi-arrow-up" aria-hidden="true"></i>
      {{ store.newCount }} {{ store.newCount === 1 ? 'nieuw event' : 'nieuwe events' }}
    </button>

    <template v-if="showSkeletons">
      <EventCardSkeleton v-for="n in 6" :key="n" />
    </template>

    <div v-else-if="store.error" class="error">
      <EmptyState
          icon="pi pi-exclamation-triangle"
          title="Events laden lukt niet"
          :description="store.error.message"
      >
        <button type="button" class="retry" @click="reload">Opnieuw proberen</button>
      </EmptyState>
    </div>

    <EmptyState
        v-else-if="store.events.length === 0"
        icon="pi pi-inbox"
        :title="store.hasActiveFilters ? 'Niets gevonden' : 'Nog geen events'"
        :description="store.hasActiveFilters
            ? 'Pas de filters aan om meer te zien.'
            : 'Zodra er iets beweegt bij de camera verschijnt het hier.'"
    >
      <button v-if="store.hasActiveFilters" type="button" class="retry" @click="onClearFilters">
        Filters wissen
      </button>
    </EmptyState>

    <template v-else>
      <template v-for="group in grouped" :key="group.key">
        <h2 class="day">{{ group.heading }}</h2>
        <EventCard
            v-for="event in group.events"
            :key="event.id"
            :event="event"
            @open="openEvent"
            @refresh-media="store.refreshMedia"
        />
      </template>

      <div ref="sentinel" class="sentinel">
        <span v-if="store.loadingMore" class="loading-more">Meer laden…</span>
        <span v-else-if="!store.hasMore && !store.stale" class="end">Dat was alles</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { api } from '@/api';
import { useEventsStore } from '@/stores/events';
import { formatDayHeading, toDateKey } from '@/lib/datetime.js';
import { useAppLifecycle } from '@/composables/useAppLifecycle.js';
import { usePullToRefresh } from '@/composables/usePullToRefresh.js';
import EventCard from '@/components/events/EventCard.vue';
import EventCardSkeleton from '@/components/events/EventCardSkeleton.vue';
import EventFilterBar from '@/components/events/EventFilterBar.vue';
import StaleBanner from '@/components/events/StaleBanner.vue';
import EmptyState from '@/components/ui/EmptyState.vue';

const POLL_INTERVAL_MS = 30_000;

const router = useRouter();
const store = useEventsStore();

const cameras = ref([]);
const sentinel = ref(null);

const showSkeletons = computed(() => store.loading && store.events.length === 0);

/**
 * Day separators. A feed with no dates in it reads as one long today, and the whole point
 * of scrolling back is knowing when you are.
 */
const grouped = computed(() => {
  const groups = [];
  let current = null;

  for (const event of store.events) {
    const key = toDateKey(event.started_at);
    if (!current || current.key !== key) {
      current = { key, heading: formatDayHeading(event.started_at), events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  return groups;
});

async function reload() {
  try {
    await store.refresh();
  } catch {
    // The store already recorded it; the error state renders from there.
  }
}

const pull = usePullToRefresh(async () => {
  await haptic();
  await reload();
});

function showNew() {
  store.applyPendingNew();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openEvent(event) {
  // Optimistic and fire-and-forget: navigating must not wait on a write.
  store.markSeen(event.id).catch(() => {});
  await router.push(`/events/${encodeURIComponent(event.id)}`);
}

function onFilterChange(patch) {
  store.setFilters(patch);
  reload();
}

function onClearFilters() {
  store.clearFilters();
  reload();
}

async function haptic() {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // No haptics in a browser; not worth a log line.
  }
}

// -- Infinite scroll --------------------------------------------------------------------
// An IntersectionObserver on a sentinel below the list, rather than a "load more" button:
// a feed is scrolled, and asking the reader to press something to keep scrolling is the
// filing-cabinet interaction this redesign is getting rid of.

let observer = null;

function observeSentinel() {
  observer?.disconnect();
  if (!sentinel.value) return;

  observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          store.loadMore().catch(() => {});
        }
      },
      // Start fetching before the sentinel is actually on screen, so the next page is
      // usually there by the time the reader arrives.
      { rootMargin: '400px' },
  );
  observer.observe(sentinel.value);
}

watch(sentinel, observeSentinel);

// -- Polling ----------------------------------------------------------------------------

let pollTimer = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => store.checkForNew(), POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

const lifecycle = useAppLifecycle({
  onBackground: stopPolling,
  onForeground: async () => {
    startPolling();
    // Time away means every signed URL in the list may have expired.
    await store.refreshIfMediaExpired();
    await store.checkForNew();
  },
});

onMounted(async () => {
  await reload();
  store.refreshUnreadCount();
  await nextTick();
  observeSentinel();
  startPolling();

  try {
    cameras.value = await api.cameras.list();
  } catch {
    // The camera chips are an enhancement; the feed works without them.
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  stopPolling();
  lifecycle.stop();
});
</script>

<style scoped>
.events {
  padding-top: var(--app-safe-top);
}

.header {
  display: flex;
  align-items: baseline;
  gap: var(--app-space-2);
  padding: var(--app-space-3) var(--app-space-4) var(--app-space-2);
}

.header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.unread {
  color: var(--app-alert);
  font-size: 13px;
  font-weight: 600;
}

.day {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: 0;
  padding: var(--app-space-2) var(--app-space-4);
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.pull {
  display: grid;
  place-items: center;
  color: var(--app-text-muted);
  overflow: hidden;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.new-pill {
  position: sticky;
  top: var(--app-space-3);
  z-index: 15;
  display: block;
  margin: var(--app-space-2) auto;
  padding: 6px 14px;
  border: none;
  border-radius: 999px;
  background: var(--app-accent);
  color: #1a1206;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  box-shadow: var(--app-shadow);
  cursor: pointer;
}

.sentinel {
  display: grid;
  place-items: center;
  min-height: 56px;
  color: var(--app-text-faint);
  font-size: 13px;
}

.retry {
  margin-top: var(--app-space-3);
  padding: 8px 16px;
  border: 1px solid var(--app-border-strong);
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
</style>
