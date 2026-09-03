import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createPreferencesMock } from '@/test/preferencesMock.js';
import { NetworkError, ApiError } from '@/api/errors.js';

const preferences = createPreferencesMock();
const eventsApi = {
    list: vi.fn(),
    get: vi.fn(),
    unreadCount: vi.fn(),
    markSeen: vi.fn(),
    feedback: vi.fn(),
};
const mediaApi = { refresh: vi.fn() };

vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));
vi.mock('@/api', () => ({
    api: { events: eventsApi, media: mediaApi },
    isMediaStale: undefined,
}));

const { useEventsStore } = await import('@/stores/events.js');

function makeEvent(id, overrides = {}) {
    return {
        id,
        camera: 'voordeur',
        severity: 'detection',
        label: 'person',
        sub_label: null,
        zones: ['pad'],
        derived_tags: [],
        top_score: 0.9,
        started_at: '2026-09-03T14:32:00+02:00',
        ended_at: null,
        duration_s: null,
        has_clip: true,
        has_snapshot: true,
        title: null,
        description: null,
        genai_severity: null,
        seen: true,
        media: { thumbnail: 't', snapshot: 's', clip: 'c', expires_at: new Date(Date.now() + 600_000).toISOString() },
        ...overrides,
    };
}

describe('events store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        preferences.store.clear();
        vi.clearAllMocks();
    });
    afterEach(() => vi.useRealTimers());

    describe('refresh', () => {
        it('replaces the feed and remembers whether there is more', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a'), makeEvent('b')], next_cursor: 'next' });
            const store = useEventsStore();

            await store.refresh();

            expect(store.events.map((e) => e.id)).toEqual(['a', 'b']);
            expect(store.hasMore).toBe(true);
            expect(store.stale).toBe(false);
        });

        it('caches the default view so a later cold open has something to show', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            await useEventsStore().refresh();

            expect(preferences.store.has('feedCache.v1')).toBe(true);
        });

        it('does not cache a filtered view', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            const store = useEventsStore();
            store.setFilters({ severity: 'alert' });

            await store.refresh();

            expect(preferences.store.has('feedCache.v1')).toBe(false);
        });

        it('shows the cached feed with a stale marker when the network is gone', async () => {
            preferences.store.set(
                'feedCache.v1',
                JSON.stringify({ fetched_at: '2026-09-03T09:00:00+02:00', events: [makeEvent('cached')] }),
            );
            eventsApi.list.mockRejectedValue(new NetworkError());
            const store = useEventsStore();

            await store.refresh();

            expect(store.events.map((e) => e.id)).toEqual(['cached']);
            expect(store.stale).toBe(true);
            expect(store.staleSince).toBe('2026-09-03T09:00:00+02:00');
            expect(store.error).toBeNull();
        });

        it('surfaces the error when there is nothing to fall back to', async () => {
            eventsApi.list.mockRejectedValue(new NetworkError());
            const store = useEventsStore();

            await expect(store.refresh()).rejects.toBeInstanceOf(NetworkError);
            expect(store.error).toBeInstanceOf(NetworkError);
        });

        it('does not swallow a real server error behind the cache', async () => {
            eventsApi.list.mockRejectedValue(new ApiError('Kapot', { status: 400 }));
            const store = useEventsStore();

            await expect(store.refresh()).rejects.toBeTruthy();
            expect(store.stale).toBe(false);
        });
    });

    describe('loadMore', () => {
        it('appends the next page', async () => {
            eventsApi.list
                .mockResolvedValueOnce({ events: [makeEvent('a')], next_cursor: 'c1' })
                .mockResolvedValueOnce({ events: [makeEvent('b')], next_cursor: null });

            const store = useEventsStore();
            await store.refresh();
            await store.loadMore();

            expect(store.events.map((e) => e.id)).toEqual(['a', 'b']);
            expect(store.hasMore).toBe(false);
            expect(eventsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c1' }));
        });

        it('never duplicates an event that a concurrent refresh already added', async () => {
            eventsApi.list
                .mockResolvedValueOnce({ events: [makeEvent('a')], next_cursor: 'c1' })
                .mockResolvedValueOnce({ events: [makeEvent('a'), makeEvent('b')], next_cursor: null });

            const store = useEventsStore();
            await store.refresh();
            await store.loadMore();

            expect(store.events.map((e) => e.id)).toEqual(['a', 'b']);
        });

        it('does nothing on the last page or while showing stale data', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            const store = useEventsStore();
            await store.refresh();
            eventsApi.list.mockClear();

            await store.loadMore();
            expect(eventsApi.list).not.toHaveBeenCalled();
        });
    });

    describe('new events while reading', () => {
        it('parks them instead of shifting the list under the reader', async () => {
            eventsApi.list.mockResolvedValueOnce({ events: [makeEvent('a')], next_cursor: null });
            const store = useEventsStore();
            await store.refresh();

            eventsApi.list.mockResolvedValueOnce({ events: [makeEvent('new'), makeEvent('a')], next_cursor: null });
            await store.checkForNew();

            expect(store.newCount).toBe(1);
            expect(store.events.map((e) => e.id)).toEqual(['a']);

            store.applyPendingNew();
            expect(store.events.map((e) => e.id)).toEqual(['new', 'a']);
            expect(store.newCount).toBe(0);
        });

        it('stays quiet when a poll fails', async () => {
            eventsApi.list.mockResolvedValueOnce({ events: [makeEvent('a')], next_cursor: null });
            const store = useEventsStore();
            await store.refresh();

            eventsApi.list.mockRejectedValueOnce(new NetworkError());
            await expect(store.checkForNew()).resolves.toBeUndefined();
            expect(store.error).toBeNull();
        });
    });

    describe('signed media', () => {
        it('leaves fresh media alone', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            const store = useEventsStore();
            await store.refresh();

            await store.ensureFreshMedia('a');

            expect(mediaApi.refresh).not.toHaveBeenCalled();
        });

        it('refreshes media that is about to expire', async () => {
            const expiring = makeEvent('a', {
                media: { thumbnail: 'old', snapshot: null, clip: null, expires_at: new Date(Date.now() + 5_000).toISOString() },
            });
            eventsApi.list.mockResolvedValue({ events: [expiring], next_cursor: null });
            mediaApi.refresh.mockResolvedValue({ thumbnail: 'new', snapshot: null, clip: null, expires_at: new Date(Date.now() + 600_000).toISOString() });

            const store = useEventsStore();
            await store.refresh();
            await store.ensureFreshMedia('a');

            expect(mediaApi.refresh).toHaveBeenCalledOnce();
            expect(store.byId('a').media.thumbnail).toBe('new');
        });

        it('coalesces a burst of cards into one request', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            mediaApi.refresh.mockResolvedValue({ thumbnail: 'new', snapshot: null, clip: null, expires_at: null });

            const store = useEventsStore();
            await store.refresh();

            await Promise.all([store.refreshMedia('a'), store.refreshMedia('a'), store.refreshMedia('a')]);

            expect(mediaApi.refresh).toHaveBeenCalledOnce();
        });

        it('does not throw when re-signing fails -- the card falls back to its icon', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });
            mediaApi.refresh.mockRejectedValue(new NetworkError());

            const store = useEventsStore();
            await store.refresh();

            await expect(store.refreshMedia('a')).resolves.toBeNull();
        });

        it('reloads the page rather than every card when the whole feed has expired', async () => {
            const stale = makeEvent('a', { media: { thumbnail: 't', snapshot: null, clip: null, expires_at: new Date(Date.now() - 1000).toISOString() } });
            eventsApi.list.mockResolvedValue({ events: [stale], next_cursor: null });

            const store = useEventsStore();
            await store.refresh();
            eventsApi.list.mockClear();
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a')], next_cursor: null });

            await store.refreshIfMediaExpired();

            expect(eventsApi.list).toHaveBeenCalledOnce();
            expect(mediaApi.refresh).not.toHaveBeenCalled();
        });
    });

    describe('read state', () => {
        it('drops the badge immediately and keeps it dropped', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a', { seen: false })], next_cursor: null });
            eventsApi.markSeen.mockResolvedValue();

            const store = useEventsStore();
            await store.refresh();
            store.unreadCount = 3;

            await store.markSeen('a');

            expect(store.byId('a').seen).toBe(true);
            expect(store.unreadCount).toBe(2);
        });

        it('puts the badge back when the server rejects it', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a', { seen: false })], next_cursor: null });
            eventsApi.markSeen.mockRejectedValue(new NetworkError());

            const store = useEventsStore();
            await store.refresh();
            store.unreadCount = 3;

            await expect(store.markSeen('a')).rejects.toBeTruthy();
            expect(store.byId('a').seen).toBe(false);
            expect(store.unreadCount).toBe(3);
        });

        it('does not double-count an event that was already seen', async () => {
            eventsApi.list.mockResolvedValue({ events: [makeEvent('a', { seen: true })], next_cursor: null });
            const store = useEventsStore();
            await store.refresh();
            store.unreadCount = 3;

            await store.markSeen('a');

            expect(store.unreadCount).toBe(3);
            expect(eventsApi.markSeen).not.toHaveBeenCalled();
        });
    });

    describe('filters', () => {
        it('knows when the view is narrowed', () => {
            const store = useEventsStore();
            expect(store.hasActiveFilters).toBe(false);

            store.setFilters({ zones: ['pad'] });
            expect(store.hasActiveFilters).toBe(true);

            store.clearFilters();
            expect(store.hasActiveFilters).toBe(false);
        });
    });
});
