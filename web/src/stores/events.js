import { defineStore } from 'pinia';
import { api } from '@/api';
import { isMediaStale } from '@/api/contract.js';
import { isOffline } from '@/api/errors.js';
import { saveFeedCache, loadFeedCache, clearFeedCache } from '@/lib/feedCache.js';

/**
 * The events feed. Replaces the day/hour cache model in stores/video.js for anything driven
 * by Frigate -- see docs/v2/05-android-app.md, "the calendar becomes a filter, not the front
 * door". video.js and its calendar endpoints stay as they are; they serve the frozen v1
 * archive (docs/v2/07-api-and-data-model.md, "Archive").
 *
 * Cursor-paginated, not offset-paginated, because new events keep arriving while the app is
 * open -- an offset would shift under the user mid-scroll.
 */

const DEFAULT_FILTERS = {
    cameras: [],
    labels: [],
    zones: [],
    severity: null,
    q: null,
    from: null,
    to: null,
};

const getDefaultState = () => ({
    events: [],
    nextCursor: null,
    hasMore: true,
    unreadCount: 0,
    filters: { ...DEFAULT_FILTERS },

    loading: false,
    loadingMore: false,
    error: null,

    /** Showing cached events because the network failed. */
    stale: false,
    staleSince: null,

    /** Events that arrived while the user was scrolled into the feed. */
    pendingNew: [],
});

/** In-flight media refreshes, keyed by event id, so a burst of cards asks once. */
const mediaRefreshes = new Map();

export const useEventsStore = defineStore('events', {
    state: () => getDefaultState(),

    getters: {
        byId: (state) => (id) => state.events.find((event) => event.id === id) ?? null,

        /** True when any filter is narrowing the feed -- drives the "clear filters" affordance. */
        hasActiveFilters: (state) =>
            state.filters.cameras.length > 0 ||
            state.filters.labels.length > 0 ||
            state.filters.zones.length > 0 ||
            state.filters.severity !== null ||
            Boolean(state.filters.q) ||
            Boolean(state.filters.from) ||
            Boolean(state.filters.to),

        /** Only the untouched first page is worth caching or comparing against. */
        isDefaultView() {
            return !this.hasActiveFilters;
        },

        newCount: (state) => state.pendingNew.length,

        /** Position of an event in the feed, for prev/next in the detail view. */
        indexOf: (state) => (id) => state.events.findIndex((event) => event.id === id),
    },

    actions: {
        setFilters(filters) {
            this.filters = { ...this.filters, ...filters };
        },

        clearFilters() {
            this.filters = { ...DEFAULT_FILTERS };
        },

        /**
         * Reloads from the top. Stale-while-revalidate: on a cold open the cached page is
         * shown immediately and replaced when the network answers, and if it does not
         * answer, the cache stays up with a badge instead of collapsing into an error.
         */
        async refresh({ silent = false } = {}) {
            if (!silent) this.loading = true;
            this.error = null;

            if (this.events.length === 0 && this.isDefaultView) {
                await this.hydrateFromCache();
            }

            try {
                const page = await api.events.list({ ...this.filters });

                this.events = page.events;
                this.nextCursor = page.next_cursor;
                this.hasMore = page.next_cursor !== null;
                this.pendingNew = [];
                this.stale = false;
                this.staleSince = null;

                if (this.isDefaultView) {
                    await saveFeedCache(page.events);
                }
            } catch (error) {
                // Losing the network with content on screen is not an error state: keep
                // what we have and say how old it is.
                if (isOffline(error) && this.events.length > 0) {
                    this.stale = true;
                    this.staleSince = this.staleSince ?? new Date().toISOString();
                    this.hasMore = false;
                } else {
                    this.error = error;
                    throw error;
                }
            } finally {
                this.loading = false;
            }
        },

        async hydrateFromCache() {
            const cached = await loadFeedCache();
            if (!cached?.events?.length) return false;

            this.events = cached.events;
            this.stale = true;
            this.staleSince = cached.fetched_at;
            this.hasMore = false;
            return true;
        },

        /** Appends the next page. A fast scroller cannot fire the same request twice. */
        async loadMore() {
            if (!this.hasMore || this.loading || this.loadingMore || this.stale) return;

            this.loadingMore = true;
            this.error = null;

            try {
                const page = await api.events.list({ cursor: this.nextCursor, ...this.filters });

                // Guard against a refresh landing mid-flight and re-adding what it replaced.
                const known = new Set(this.events.map((event) => event.id));
                this.events = [...this.events, ...page.events.filter((event) => !known.has(event.id))];
                this.nextCursor = page.next_cursor;
                this.hasMore = page.next_cursor !== null;
            } catch (error) {
                this.error = error;
                throw error;
            } finally {
                this.loadingMore = false;
            }
        },

        /**
         * Polls for events newer than the top of the feed and parks them, so the list does
         * not jump under someone who is reading it. The UI surfaces them as a pill.
         */
        async checkForNew() {
            if (this.loading || this.stale || !this.isDefaultView || this.events.length === 0) return;

            try {
                const page = await api.events.list({ ...this.filters, limit: 25 });
                const known = new Set(this.events.map((event) => event.id));
                const fresh = page.events.filter((event) => !known.has(event.id));

                if (fresh.length > 0) {
                    this.pendingNew = fresh;
                }
            } catch {
                // A failed poll is not worth telling anyone about; the next one will do.
            }
        },

        /** Moves the parked events into the feed. */
        applyPendingNew() {
            if (this.pendingNew.length === 0) return;
            this.events = [...this.pendingNew, ...this.events];
            this.pendingNew = [];
        },

        /**
         * Fetches one event and merges it in -- covers opening an event straight from a
         * push notification, which may not be on the loaded page of the feed at all.
         */
        async loadOne(id) {
            const event = await api.events.get(id);
            this.mergeEvent(event);
            return event;
        },

        /**
         * Deletes an event, here and upstream.
         *
         * The row leaves the list only after the API confirms, not before. An optimistic
         * removal would look better for the half-second it takes and then have to put a
         * deleted-looking event back when Frigate refuses -- and the whole point of this
         * action is that the user believes what it says.
         */
        async remove(id) {
            await api.events.remove(id);

            this.events = this.events.filter((event) => event.id !== id);
            this.pendingNew = this.pendingNew.filter((event) => event.id !== id);
            if (this.unreadCount > 0) {
                // Cheaper and less wrong than recounting: only an unseen event can have
                // been contributing to the badge.
                this.unreadCount = Math.max(0, this.unreadCount - 1);
            }
        },

        mergeEvent(event) {
            const index = this.events.findIndex((candidate) => candidate.id === event.id);
            if (index === -1) {
                this.events = [event, ...this.events];
            } else {
                this.events[index] = { ...this.events[index], ...event };
            }
        },

        // -- Signed media ----------------------------------------------------------------
        //
        // Signed URLs live ten minutes; a scrolled feed does not. Callers ask before binding
        // anything expensive, and the cheap case (<img>) recovers on its own error event.

        /** @returns {Promise<object|null>} the freshest media block for that event */
        async ensureFreshMedia(id, { force = false } = {}) {
            const event = this.byId(id);
            if (!force && event && !isMediaStale(event.media)) {
                return event.media;
            }
            return this.refreshMedia(id);
        },

        async refreshMedia(id) {
            if (mediaRefreshes.has(id)) return mediaRefreshes.get(id);

            const inFlight = api.media
                .refresh(id)
                .then((media) => {
                    const event = this.byId(id);
                    if (event) event.media = media;
                    return media;
                })
                .catch((error) => {
                    console.warn(`Could not refresh media for ${id}:`, error?.message);
                    return null;
                })
                .finally(() => {
                    mediaRefreshes.delete(id);
                });

            mediaRefreshes.set(id, inFlight);
            return inFlight;
        },

        /**
         * After time away, one expired event at the top means every URL below it expired
         * too. Reloading the page is one request; re-signing each card is dozens.
         */
        async refreshIfMediaExpired() {
            const newest = this.events[0];
            if (!newest || !isMediaStale(newest.media)) return;
            await this.refresh({ silent: true });
        },

        // -- Read state ------------------------------------------------------------------

        async refreshUnreadCount() {
            try {
                this.unreadCount = await api.events.unreadCount();
            } catch {
                // The badge is not worth an error state.
            }
        },

        async markSeen(id) {
            const event = this.byId(id);
            if (event?.seen) return;

            // Optimistic: the badge should drop the moment the card is opened.
            if (event) event.seen = true;
            if (this.unreadCount > 0) this.unreadCount -= 1;

            try {
                await api.events.markSeen(id);
            } catch (error) {
                if (event) event.seen = false;
                this.unreadCount += 1;
                throw error;
            }
        },

        async sendFeedback(id, feedback) {
            await api.events.feedback(id, feedback);
            const event = this.byId(id);
            if (event) event.feedback_sent = true;
        },

        async resetStore() {
            await clearFeedCache();
            this.$reset();
        },
    },

    // Deliberately NOT persisted through pinia (unlike stores/video.js): a feed should be
    // fresh on open, and persisting a cursor risks resuming a stale one against a feed that
    // has moved on. The offline copy is a separate, explicit cache in lib/feedCache.js.
});
