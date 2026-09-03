import { getOptional, absolute } from './client.js';

export function createTimelineApi() {
    return {
        /** HANDOFF H4. */
        async getDay(camera, date) {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const raw = await getOptional(`/api/cameras/${encodeURIComponent(camera)}/timeline`, { date, tz });
            return {
                camera: raw?.camera ?? camera,
                date: raw?.date ?? date,
                expires_at: raw?.expires_at ?? null,
                recordings: (raw?.recordings ?? []).map((r) => ({ ...r, vod_url: absolute(r.vod_url) })),
                previews: (raw?.previews ?? []).map((p) => ({ ...p, preview_url: absolute(p.preview_url) })),
                events: raw?.events ?? [],
            };
        },
    };
}
