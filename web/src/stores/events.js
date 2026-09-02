import { defineStore } from 'pinia';
import { fetchEventFeed, fetchEvent, fetchUnreadCount, markEventSeen, sendEventFeedback } from '@/api/eventsApi.js';

/**
 * The events feed. Replaces the day/hour cache model in stores/video.js for anything
 * driven by Frigate -- see docs/v2/05-android-app.md, "the calendar becomes a filter,
 * not the front door". video.js and its calendar/hour endpoints stay as they are; they
 * serve the frozen v1 archive (docs/v2/07-api-and-data-model.md, "Archive").
 *
 * Cursor-paginated, not offset-paginated, because new events keep arriving while the
 * app is open -- an offset would shift under the user mid-scroll. See
 * docs/v2/07-api-and-data-model.md#events.
 */
const getDefaultState = () => ({
    events: [],
    nextCursor: null,
    hasMore: true,
    unreadCount: 0,
    filters: {
        cameras: [],
        labels: [],
        zones: [],
        severity: null,
        q: null,
    },
    loading: false,
    error: null,
});

export const useEventsStore = defineStore('events', {
    state: () => getDefaultState(),

    getters: {
        byId: (state) => (id) => state.events.find((event) => event.id === id) ?? null,
    },

    actions: {
        setFilters(filters) {
            this.filters = { ...this.filters, ...filters };
        },

        /**
         * Reloads the feed from the top with the current filters. Used on pull-to-refresh
         * and whenever filters change.
         */
        async refresh() {
            this.loading = true;
            this.error = null;
            try {
                const page = await fetchEventFeed({ cursor: null, ...this.filters });
                this.events = page.events;
                this.nextCursor = page.next_cursor;
                this.hasMore = page.next_cursor !== null;
            } catch (error) {
                this.error = error;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        /**
         * Appends the next page. No-op if there isn't one or a fetch is already in
         * flight, so a fast scroller can't fire the same request twice.
         */
        async loadMore() {
            if (!this.hasMore || this.loading) {
                return;
            }
            this.loading = true;
            this.error = null;
            try {
                const page = await fetchEventFeed({ cursor: this.nextCursor, ...this.filters });
                this.events = [...this.events, ...page.events];
                this.nextCursor = page.next_cursor;
                this.hasMore = page.next_cursor !== null;
            } catch (error) {
                this.error = error;
                throw error;
            } finally {
                this.loading = false;
            }
        },

        /**
         * Fetches one event and merges it into the feed if it's already loaded --
         * covers opening an event straight from a push notification deep link, which
         * may not be on the current page of the feed at all.
         */
        async loadOne(id) {
            const event = await fetchEvent(id);
            const index = this.events.findIndex((e) => e.id === id);
            if (index === -1) {
                this.events = [event, ...this.events];
            } else {
                this.events[index] = event;
            }
            return event;
        },

        async refreshUnreadCount() {
            this.unreadCount = await fetchUnreadCount();
        },

        async markSeen(id) {
            await markEventSeen(id);
            const event = this.byId(id);
            if (event) {
                event.seen = true;
            }
            if (this.unreadCount > 0) {
                this.unreadCount -= 1;
            }
        },

        async sendFeedback(id, feedback) {
            await sendEventFeedback(id, feedback);
        },

        resetStore() {
            this.$reset();
        },
    },

    // Deliberately NOT persisted (unlike stores/video.js): a feed is meant to be fresh
    // on open, and persisting a cursor across sessions risks resuming a stale/expired
    // one against a feed that has since moved on.
});
