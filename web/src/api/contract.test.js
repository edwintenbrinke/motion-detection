import { describe, it, expect } from 'vitest';
import {
    normaliseEvent,
    normalisePage,
    normaliseLiveSource,
    normaliseTimelineDay,
    asEpochMs,
    isMediaStale,
    encodeCursor,
    decodeCursor,
    MEDIA_STALE_MARGIN_MS,
} from './contract.js';

const raw = {
    id: 'abc-123',
    camera: 'voordeur',
    severity: 'alert',
    label: 'person',
    sub_label: 'bezorger',
    zones: ['pad', 'straat'],
    derived_tags: ['bezoek'],
    top_score: 0.91,
    started_at: '2026-09-03T14:32:00+02:00',
    ended_at: '2026-09-03T14:32:42+02:00',
    has_clip: true,
    has_snapshot: true,
    title: 'Persoon bij de voordeur',
    description: 'Bezorger zet een pakket neer',
    genai_severity: 'normal',
    seen: false,
};

describe('normaliseEvent', () => {
    it('keeps the BFF keys and derives the duration', () => {
        const event = normaliseEvent(raw);
        expect(event.id).toBe('abc-123');
        expect(event.zones).toEqual(['pad', 'straat']);
        expect(event.duration_s).toBe(42);
    });

    it('fills in a media block when the DTO has none, which is the case today', () => {
        expect(normaliseEvent(raw).media).toEqual({ thumbnail: null, snapshot: null, clip: null, clip_hls: null, clip_duration_s: null, expires_at: null });
    });

    // The playlist is what the player seeks in; the mp4 is what it falls back to. An API
    // that serves neither, or only the mp4, has to keep working.
    // See docs/v2/13-timeline-and-players.md#b1.
    it('carries the clip playlist alongside the mp4, and null when there is none', () => {
        const withBoth = normaliseEvent({
            ...raw,
            media: { clip: '/api/media/clip/1?sig=x', clip_hls: '/api/timeline/voordeur/vod/1/2/index.m3u8?sig=x', clip_duration_s: 14 },
        });
        expect(withBoth.media.clip_hls).toBe('/api/timeline/voordeur/vod/1/2/index.m3u8?sig=x');
        expect(withBoth.media.clip).toBe('/api/media/clip/1?sig=x');
        expect(withBoth.media.clip_duration_s).toBe(14);

        const mp4Only = normaliseEvent({ ...raw, media: { clip: '/api/media/clip/1?sig=x' } });
        expect(mp4Only.media.clip_hls).toBeNull();
        expect(mp4Only.media.clip).toBe('/api/media/clip/1?sig=x');
    });

    it('treats anything that is not "alert" as a detection', () => {
        expect(normaliseEvent({ ...raw, severity: 'detection' }).severity).toBe('detection');
        expect(normaliseEvent({ ...raw, severity: null }).severity).toBe('detection');
        expect(normaliseEvent({ ...raw, severity: 'ALERT' }).severity).toBe('detection');
    });

    it('survives the sparse events the API actually returns', () => {
        const event = normaliseEvent({ id: 7, camera: 'voordeur', severity: 'detection', started_at: raw.started_at });
        expect(event.id).toBe('7');
        expect(event.zones).toEqual([]);
        expect(event.derived_tags).toEqual([]);
        expect(event.duration_s).toBeNull();
        expect(event.top_score).toBeNull();
        expect(event.has_clip).toBe(false);
    });

    it('drops empty entries from array fields rather than rendering blank chips', () => {
        expect(normaliseEvent({ ...raw, zones: ['pad', '', null] }).zones).toEqual(['pad']);
    });

    it('does not invent a duration from a nonsensical range', () => {
        expect(normaliseEvent({ ...raw, ended_at: '2026-09-03T14:00:00+02:00' }).duration_s).toBeNull();
        expect(normaliseEvent({ ...raw, ended_at: 'not a date' }).duration_s).toBeNull();
    });
});

describe('normalisePage', () => {
    it('reads the feed envelope', () => {
        const page = normalisePage({ events: [raw], next_cursor: 'abc' });
        expect(page.events).toHaveLength(1);
        expect(page.next_cursor).toBe('abc');
    });

    it('treats a malformed body as an empty last page instead of throwing', () => {
        expect(normalisePage(null)).toEqual({ events: [], next_cursor: null });
        expect(normalisePage({})).toEqual({ events: [], next_cursor: null });
    });
});

describe('isMediaStale', () => {
    const now = Date.parse('2026-09-03T14:00:00Z');

    it('is false while there is comfortably time left', () => {
        expect(isMediaStale({ expires_at: new Date(now + 9 * 60_000).toISOString() }, now)).toBe(false);
    });

    it('is true inside the safety margin, so a slow request still lands in time', () => {
        expect(isMediaStale({ expires_at: new Date(now + MEDIA_STALE_MARGIN_MS - 1000).toISOString() }, now)).toBe(true);
    });

    it('is true once expired', () => {
        expect(isMediaStale({ expires_at: new Date(now - 1000).toISOString() }, now)).toBe(true);
    });

    it('is true when there is nothing to judge -- refreshing is cheaper than a dead URL', () => {
        expect(isMediaStale(null, now)).toBe(true);
        expect(isMediaStale({}, now)).toBe(true);
        expect(isMediaStale({ expires_at: 'whenever' }, now)).toBe(true);
    });
});

describe('cursors', () => {
    it('round-trips', () => {
        const cursor = encodeCursor('2026-09-03T14:32:00+02:00', 'abc-123');
        expect(decodeCursor(cursor)).toEqual({ startedAt: '2026-09-03T14:32:00+02:00', id: 'abc-123' });
    });

    it('keeps ids that contain the separator intact', () => {
        expect(decodeCursor(encodeCursor('2026-09-03T14:32:00+02:00', 'a|b')).id).toBe('a|b');
    });

    it('restarts the feed rather than throwing on a tampered cursor', () => {
        expect(decodeCursor('!!!not base64!!!')).toBeNull();
        expect(decodeCursor(btoa('no separator'))).toBeNull();
        expect(decodeCursor(btoa('not-a-date|abc'))).toBeNull();
        expect(decodeCursor(null)).toBeNull();
    });
});

describe('normaliseLiveSource', () => {
    it('reads the ordered rung list', () => {
        const source = normaliseLiveSource({
            camera: 'voordeur',
            rungs: [{ type: 'webrtc', url: 'https://lan/whep' }, { type: 'mse', url: 'wss://x/ws' }],
        });
        expect(source.rungs.map((r) => r.type)).toEqual(['webrtc', 'mse']);
        expect(source.rungs[0].ice_servers).toEqual([]);
        expect(source.rungs[1].interval_ms).toBe(1000);
    });

    it('accepts the flatter shape written in docs/v2/07', () => {
        const source = normaliseLiveSource(
            { whep_url: 'https://lan/whep', ice_servers: [{ urls: 'stun:x' }], fallbacks: ['mse', 'hls'] },
            'voordeur',
        );
        expect(source.rungs.map((r) => r.type)).toEqual(['webrtc', 'mse', 'hls']);
        expect(source.rungs[0].ice_servers).toEqual([{ urls: 'stun:x' }]);
        expect(source.camera).toBe('voordeur');
    });

    it('discards rung types the player has no client for', () => {
        const source = normaliseLiveSource({ rungs: [{ type: 'webrtc', url: 'x' }, { type: 'carrier-pigeon', url: 'y' }] });
        expect(source.rungs.map((r) => r.type)).toEqual(['webrtc']);
    });

    it('returns an empty ladder rather than throwing on nothing', () => {
        expect(normaliseLiveSource(null, 'voordeur')).toEqual({ camera: 'voordeur', expires_at: null, rungs: [] });
    });
});

describe('asEpochMs', () => {
    const iso = '2026-09-05T12:00:00Z';
    const ms = Date.parse(iso);

    it('reads unix seconds, which is what the BFF used to send', () => {
        expect(asEpochMs(ms / 1000)).toBe(ms);
    });

    it('reads milliseconds unchanged', () => {
        expect(asEpochMs(ms)).toBe(ms);
    });

    it('reads an ISO string, which is what the BFF sends now and the mock always did', () => {
        expect(asEpochMs(iso)).toBe(ms);
    });

    it('reads a numeric string, where Date.parse answers NaN', () => {
        expect(asEpochMs(String(ms / 1000))).toBe(ms);
    });

    it('answers null rather than NaN, so nothing downstream draws at NaN', () => {
        for (const value of [null, undefined, '', 'gisteren', {}, NaN, Infinity]) {
            expect(asEpochMs(value)).toBeNull();
        }
    });
});

describe('normaliseTimelineDay', () => {
    const seconds = (iso) => Date.parse(iso) / 1000;

    const raw = {
        camera: 'voordeur',
        date: '2026-09-05',
        expires_at: '2026-09-05T12:10:00Z',
        recordings: [
            { start: seconds('2026-09-05T03:00:00Z'), end: seconds('2026-09-05T04:00:00Z'), vod_url: '/b.m3u8' },
            { start: seconds('2026-09-05T01:00:00Z'), end: seconds('2026-09-05T02:00:00Z'), vod_url: '/a.m3u8' },
        ],
        previews: [{ start: seconds('2026-09-05T01:00:00Z'), end: seconds('2026-09-05T02:00:00Z'), preview_url: '/p.mp4' }],
        events: [{ id: 42, start: seconds('2026-09-05T01:30:00Z'), end: null, label: 'person', severity: 'alert' }],
    };

    it('turns every time into milliseconds', () => {
        const day = normaliseTimelineDay(raw);
        expect(day.recordings[0].start_ms).toBe(Date.parse('2026-09-05T01:00:00Z'));
        expect(day.previews[0].end_ms).toBe(Date.parse('2026-09-05T02:00:00Z'));
        expect(day.events[0].start_ms).toBe(Date.parse('2026-09-05T01:30:00Z'));
    });

    it('accepts ISO too, so the app survives an API that has not been redeployed', () => {
        const day = normaliseTimelineDay({
            recordings: [{ start: '2026-09-05T01:00:00Z', end: '2026-09-05T02:00:00Z', vod_url: '/a.m3u8' }],
        });
        expect(day.recordings[0].start_ms).toBe(Date.parse('2026-09-05T01:00:00Z'));
    });

    it('sorts spans by start, whatever order they arrived in', () => {
        expect(normaliseTimelineDay(raw).recordings.map((r) => r.vod_url)).toEqual(['/a.m3u8', '/b.m3u8']);
    });

    it('drops a malformed span instead of letting NaN reach the strip', () => {
        const day = normaliseTimelineDay({
            recordings: [
                { start: 'nonsense', end: 'nonsense', vod_url: '/bad.m3u8' },
                { start: seconds('2026-09-05T02:00:00Z'), end: seconds('2026-09-05T01:00:00Z'), vod_url: '/backwards.m3u8' },
                { start: seconds('2026-09-05T01:00:00Z'), end: seconds('2026-09-05T02:00:00Z') },
                { start: seconds('2026-09-05T01:00:00Z'), end: seconds('2026-09-05T02:00:00Z'), vod_url: '/good.m3u8' },
            ],
        });
        expect(day.recordings.map((r) => r.vod_url)).toEqual(['/good.m3u8']);
    });

    it('keeps an event that has not ended, with a null end', () => {
        expect(normaliseTimelineDay(raw).events[0]).toMatchObject({ id: '42', end_ms: null, severity: 'alert' });
    });

    it('returns empty arrays rather than throwing on nothing', () => {
        expect(normaliseTimelineDay(null, 'voordeur', '2026-09-05')).toEqual({
            camera: 'voordeur',
            date: '2026-09-05',
            expires_at: null,
            recordings: [],
            previews: [],
            events: [],
        });
    });
});
