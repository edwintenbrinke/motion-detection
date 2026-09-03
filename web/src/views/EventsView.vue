<template>
  <div class="events-view">
    <div class="filter-toggle-container">
      <div class="toggle-tabs">
        <div
            class="toggle-tab"
            :class="{ active: !eventsStore.filters.severity }"
            @click="setSeverityFilter(null)"
        >
          <i class="fa-solid fa-list"></i>
          <span>All</span>
        </div>
        <div
            class="toggle-tab"
            :class="{ active: eventsStore.filters.severity === 'alert' }"
            @click="setSeverityFilter('alert')"
        >
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>Alerts</span>
        </div>
      </div>
    </div>

    <div v-if="eventsStore.error" class="error-banner">
      <i class="pi pi-exclamation-triangle"></i>
      <span>Kon events niet laden.</span>
      <Button label="Opnieuw" size="small" @click="refresh" />
    </div>

    <div v-if="!eventsStore.loading && eventsStore.events.length === 0 && !eventsStore.error" class="empty-state">
      <i class="fa-solid fa-camera"></i>
      <p>Nog geen events.</p>
    </div>

    <div class="event-list">
      <EventCard
          v-for="event in eventsStore.events"
          :key="event.id"
          :event="event"
          @open="openEvent"
      />
    </div>

    <div v-if="eventsStore.hasMore" class="load-more">
      <Button
          label="Meer laden"
          :loading="eventsStore.loading"
          @click="loadMore"
      />
    </div>
  </div>
</template>

<script>
import { useEventsStore } from '@/stores/events.js';
import EventCard from '@/components/EventCard.vue';

export default {
  name: 'EventsView',
  components: { EventCard },
  setup() {
    const eventsStore = useEventsStore();
    return { eventsStore };
  },
  async mounted() {
    await this.refresh();
    // The store rethrows so callers can react; nothing here can, and an unhandled
    // rejection in mounted() would surface as a console error with no context.
    try {
      await this.eventsStore.refreshUnreadCount();
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  },
  methods: {
    async refresh() {
      try {
        await this.eventsStore.refresh();
      } catch (error) {
        console.error('Failed to load event feed:', error);
      }
    },
    async loadMore() {
      try {
        await this.eventsStore.loadMore();
      } catch (error) {
        console.error('Failed to load more events:', error);
      }
    },
    async setSeverityFilter(severity) {
      this.eventsStore.setFilters({ severity });
      await this.refresh();
    },
    async openEvent(event) {
      if (!event.seen) {
        // Failing to mark as seen shouldn't block opening the event, so it's caught
        // here rather than propagating out of a click handler.
        try {
          await this.eventsStore.markSeen(event.id);
        } catch (error) {
          console.error('Failed to mark event as seen:', error);
        }
      }
      // Event detail view (player, feedback button) is a follow-up -- see
      // docs/v2/05-android-app.md#event-detail. Not built yet.
    },
  },
};
</script>

<style scoped>
.events-view {
  max-width: 700px;
  margin: 0 auto;
  padding: 12px;
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.filter-toggle-container {
  display: flex;
  justify-content: center;
}

.toggle-tabs {
  display: flex;
  border-radius: 999px;
  background: #eee;
  padding: 4px;
}

.toggle-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.85rem;
}

.toggle-tab.active {
  background: #fff;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  color: var(--p-text-muted-color, #666);
  padding: 48px 0;
}

.empty-state i {
  font-size: 2rem;
  margin-bottom: 8px;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #ffe0e0;
  color: #a00;
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 12px;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
</style>
