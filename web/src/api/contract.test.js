import { describe, it, expect } from 'vitest';
import {
    normaliseEvent,
    normalisePage,
    normaliseLiveSource,
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
        expect(normaliseEvent(raw).media).toEqual({ thumbnail: null, snapshot: null, clip: null, clip_duration_s: null, expires_at: null });
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
