import { get, post, absolute, del } from './client.js';
import { normalisePage, normaliseEvent } from '@/api/contract.js';

function withAbsoluteMedia(event) {
    return {
        ...event,
        media: {
            thumbnail: absolute(event.media.thumbnail),
            snapshot: absolute(event.media.snapshot),
            clip: absolute(event.media.clip),
            expires_at: event.media.expires_at,
        },
    };
}

export function createEventsApi() {
    return {
        /**
         * `from`, `to` and `q` are documented in 07 but ignored by EventController today
         * (HANDOFF H7). They are sent anyway: harmless now, correct the moment the
         * controller learns them, and it keeps one contract instead of two.
         */
        async list({ cursor = null, limit = 25, cameras = [], labels = [], zones = [], severity = null, q = null, from = null, to = null } = {}) {
            const params = { limit };
            if (cursor) params.cursor = cursor;
            if (cameras.length) params.cameras = cameras;
            if (labels.length) params.labels = labels;
            if (zones.length) params.zones = zones;
            if (severity) params.severity = severity;
            if (q) params.q = q;
            if (from) params.from = from;
            if (to) params.to = to;

            const page = normalisePage(await get('/api/events', params));
            return { ...page, events: page.events.map(withAbsoluteMedia) };
        },

        async get(id) {
            return withAbsoluteMedia(normaliseEvent(await get(`/api/events/${encodeURIComponent(id)}`)));
        },

        async unreadCount() {
            const data = await get('/api/events/unread-count');
            return Number(data?.count ?? 0);
        },

        async markSeen(id) {
            await post(`/api/events/${encodeURIComponent(id)}/seen`);
        },

        /**
         * The endpoint validates a single non-blank string (EventFeedbackInputDTO), while
         * 07 describes `{correct, should_be}`. Until that is settled (HANDOFF H8) the app
         * packs its structure into the string, so nothing is lost either way.
         */
        /**
         * Irreversible: the API deletes the clip and snapshot in Frigate too. Not silent --
         * the user asked for this one and the overlay is the acknowledgement.
         */
        async remove(id) {
            await del(`/api/events/${encodeURIComponent(id)}`, { silent: false });
        },

        async feedback(id, feedback) {
            await post(`/api/events/${encodeURIComponent(id)}/feedback`, { feedback }, { silent: false });
        },
    };
}
