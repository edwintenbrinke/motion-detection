import { getOptional, absolute } from './client.js';
import { normaliseTimelineDay } from '@/api/contract.js';

export function createTimelineApi() {
    return {
        /** HANDOFF H4. */
        async getDay(camera, date) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const raw = await getOptional(`/api/cameras/${encodeURIComponent(camera)}/timeline`, { date, tz });

            // Times become milliseconds here and nowhere else; the strip is maths on
            // numbers and has no business parsing anything. See
            // docs/v2/13-timeline-and-players.md#a1.
            const day = normaliseTimelineDay(raw, camera, date);

            return {
                ...day,
                recordings: day.recordings.map((r) => ({ ...r, vod_url: absolute(r.vod_url) })),
                previews: day.previews.map((p) => ({ ...p, preview_url: absolute(p.preview_url) })),
            };
        },
    };
}
