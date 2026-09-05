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
                // The template is a URL like any other here; {start}/{end} survive both the
                // prefixing and, later, encodeURI -- braces are legal in a path.
                vod: day.vod ? { ...day.vod, url_template: absolute(day.vod.url_template) } : null,
                previews: day.previews.map((p) => ({ ...p, preview_url: absolute(p.preview_url) })),
            };
        },
    };
}
