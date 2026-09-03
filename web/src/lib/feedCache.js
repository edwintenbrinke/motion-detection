import { Preferences } from '@capacitor/preferences';

/**
 * The first page of the feed, kept on disk.
 *
 * docs/v2/05-android-app.md: "The feed is the only thing worth caching; show the last known
 * events with a stale badge rather than an error." A camera app opened on a train should
 * show last night's events with a note, not a spinner and then a failure.
 *
 * Only the default, unfiltered first page is cached. Caching filtered pages would multiply
 * the storage and the staleness questions for something nobody reopens the app to see.
 */
const KEY = 'feedCache.v1';
const MAX_EVENTS = 30;

export async function saveFeedCache(events) {
    try {
        const payload = JSON.stringify({
            fetched_at: new Date().toISOString(),
            events: events.slice(0, MAX_EVENTS),
        });
        await Preferences.set({ key: KEY, value: payload });
    } catch (error) {
        // A full or unavailable store is not worth failing a successful fetch over.
        console.warn('Could not cache the feed:', error?.message);
    }
}

/** @returns {Promise<{events: Array, fetched_at: string}|null>} */
export async function loadFeedCache() {
    try {
        const { value } = await Preferences.get({ key: KEY });
        if (!value) return null;

        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed?.events) || !parsed.fetched_at) return null;

        return { events: parsed.events, fetched_at: parsed.fetched_at };
    } catch {
        return null;
    }
}

export async function clearFeedCache() {
    try {
        await Preferences.remove({ key: KEY });
    } catch {
        /* ignore */
    }
}
