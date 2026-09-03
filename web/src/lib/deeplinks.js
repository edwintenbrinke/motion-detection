/**
 * Turning an incoming link into a route.
 *
 * Three shapes reach the app and all of them mean the same thing (docs/v2/04-notifications.md
 * and 05-android-app.md):
 *
 *   motiondetection://event/<id>                     the custom scheme
 *   https://motion.edwintenbrinke.nl/event/<id>      the App Link
 *   /event/<id>                                      a bare path, e.g. from an FCM payload
 *
 * A pure function, so the parsing is tested rather than discovered in the field with a
 * phone in one hand.
 */
export const APP_SCHEME = 'motiondetection';
export const APP_HOST = 'motion.edwintenbrinke.nl';

export function parseDeepLink(input) {
    if (typeof input !== 'string' || input.trim() === '') return null;

    const raw = input.trim();
    let path;

    if (raw.startsWith(`${APP_SCHEME}://`)) {
        // A custom scheme has no meaningful host, so 'event' lands in the host position:
        // motiondetection://event/abc parses as host=event, pathname=/abc.
        const withoutScheme = raw.slice(`${APP_SCHEME}://`.length);
        path = `/${withoutScheme}`;
    } else if (/^https?:\/\//i.test(raw)) {
        let url;
        try {
            url = new URL(raw);
        } catch {
            return null;
        }
        // Only our own host: an arbitrary https link must not be able to drive navigation.
        if (url.hostname !== APP_HOST) return null;
        path = url.pathname;
    } else if (raw.startsWith('/')) {
        path = raw;
    } else {
        return null;
    }

    const match = path.match(/^\/events?\/([^/?#]+)/);
    if (!match) return null;

    const id = decodeURIComponent(match[1]);
    if (!id) return null;

    return `/events/${encodeURIComponent(id)}`;
}

/** Reads an event id out of an FCM data payload, whichever field carries it. */
export function routeFromNotification(data) {
    if (!data || typeof data !== 'object') return null;

    if (data.event_id) return `/events/${encodeURIComponent(String(data.event_id))}`;
    if (data.url) return parseDeepLink(String(data.url));

    return null;
}
