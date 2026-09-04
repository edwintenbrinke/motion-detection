import { getDb, resetDb } from './db.js';
import { simulate } from './latency.js';
import { getMockSettings } from './settings.js';
import { renderFrame, renderCameraStill } from './thumbnails.js';
import { buildTimelineDay } from './timeline.js';
import { CAMERAS, DEFAULT_NOTIFICATION_RULES } from './fixtures.js';
import { normaliseEvent, normalisePage, normaliseLiveSource, encodeCursor, decodeCursor } from '@/api/contract.js';
import { ApiError } from '@/api/errors.js';

/** The one binary in the mock world; see scripts/make-sample-clip.mjs. */
const SAMPLE_CLIP = '/mock/sample-clip.mp4';

function mediaFor(event) {
    const ttl = getMockSettings().mediaTtlSeconds;
    return {
        thumbnail: renderFrame(event, { width: 320, height: 180 }),
        snapshot: renderFrame(event, { width: 960, height: 540, detail: true }),
        clip: event.has_clip ? SAMPLE_CLIP : null,
        expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    };
}

function decorate(event) {
    return normaliseEvent({ ...event, media: mediaFor(event) });
}

function matchesFilters(event, { cameras, labels, zones, severity, q, from, to }) {
    if (cameras.length && !cameras.includes(event.camera)) return false;
    if (labels.length && !labels.includes(event.label)) return false;
    if (zones.length && !event.zones.some((zone) => zones.includes(zone))) return false;
    if (severity && event.severity !== severity) return false;

    const started = Date.parse(event.started_at);
    if (from && started < Date.parse(from)) return false;
    if (to && started > Date.parse(to)) return false;

    if (q) {
        // Stands in for Frigate's semantic search: the same fields the BFF would LIKE over
        // when layer 4 is off (docs/v2/07-api-and-data-model.md).
        const haystack = [event.description, event.title, event.sub_label, event.label, ...event.zones, ...event.derived_tags]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        if (!haystack.includes(q.toLowerCase())) return false;
    }

    return true;
}

export function createMockAdapter() {
    const events = {
        async list({ cursor = null, limit = 25, cameras = [], labels = [], zones = [], severity = null, q = null, from = null, to = null } = {}) {
            await simulate();
            const db = getDb();
            const filters = { cameras, labels, zones, severity, q, from, to };

            let rows = db.events.filter((event) => matchesFilters(event, filters));

            const position = decodeCursor(cursor);
            if (position) {
                const after = Date.parse(position.startedAt);
                // Same ordering as the SQL: started_at DESC, id DESC.
                rows = rows.filter((event) => {
                    const started = Date.parse(event.started_at);
                    if (started !== after) return started < after;
                    return event.id < position.id;
                });
            }

            const page = rows.slice(0, limit);
            const hasMore = rows.length > limit;
            const last = page[page.length - 1];

            return normalisePage({
                events: page.map((event) => ({ ...event, media: mediaFor(event) })),
                next_cursor: hasMore && last ? encodeCursor(last.started_at, last.id) : null,
            });
        },

        async get(id) {
            await simulate();
            const event = getDb().events.find((candidate) => candidate.id === id);
            if (!event) throw new ApiError('Event niet gevonden', { status: 404 });
            return decorate(event);
        },

        async unreadCount() {
            await simulate({ canFail: false });
            return getDb().events.filter((event) => !event.seen).length;
        },

        async markSeen(id) {
            await simulate({ canFail: false });
            const event = getDb().events.find((candidate) => candidate.id === id);
            if (event) event.seen = true;
        },

        async remove(id) {
            await simulate();
            const db = getDb();
            const index = db.events.findIndex((candidate) => candidate.id === id);
            if (index >= 0) db.events.splice(index, 1);
        },

        async feedback(id, feedback) {
            await simulate();
            const event = getDb().events.find((candidate) => candidate.id === id);
            if (event) event.feedback = feedback;
        },
    };

    return {
        mode: 'mock',

        auth: {
            // Any credentials work: the mock exists to exercise the app, not the login form.
            async login() {
                await simulate({ canFail: false });
                return { token: makeMockJwt(), refresh_token: 'mock-refresh-token' };
            },
            async refresh() {
                await simulate({ canFail: false });
                return { token: makeMockJwt() };
            },
            async logout() {},
            async initialize() {
                await simulate({ canFail: false });
                return {
                    user: { id: 1, username: 'edwin', created_at: new Date('2024-01-01').toISOString() },
                    settings: { id: 1, detection_area_points: [], placeholder_image_url: null },
                };
            },
        },

        events,

        media: {
            async refresh(id) {
                await simulate({ canFail: false });
                const event = getDb().events.find((candidate) => candidate.id === id);
                if (!event) throw new ApiError('Event niet gevonden', { status: 404 });
                return mediaFor(event);
            },
        },

        cameras: {
            async list() {
                await simulate();
                return CAMERAS.map((camera) => ({ ...camera }));
            },
            snapshotUrl(camera) {
                return renderCameraStill(camera);
            },
        },

        live: {
            async getSource(camera) {
                await simulate();
                const { failRungs } = getMockSettings();
                // A rung with no URL fails immediately, which is how the mock makes the
                // ladder descend on demand instead of by unplugging something.
                const rung = (type, extra = {}) => ({
                    type,
                    url: failRungs.includes(type) ? null : extra.url ?? `mock://${type}/${camera}`,
                    ...extra,
                });

                return normaliseLiveSource({
                    camera,
                    expires_at: new Date(Date.now() + getMockSettings().mediaTtlSeconds * 1000).toISOString(),
                    rungs: [
                        rung('webrtc'),
                        rung('mse'),
                        rung('hls'),
                        // The rung that actually plays something in the browser today.
                        rung('file', { url: failRungs.includes('file') ? null : SAMPLE_CLIP }),
                        rung('snapshot', { url: renderCameraStill(camera), interval_ms: 1000 }),
                    ],
                }, camera);
            },
        },

        timeline: {
            async getDay(camera, date) {
                await simulate();
                return buildTimelineDay(camera, date, getDb().events, SAMPLE_CLIP);
            },
        },

        zones: {
            async get(camera) {
                await simulate();
                return getDb().zones[camera] ?? defaultZones(camera);
            },
            async put(camera, zones) {
                await simulate();
                getDb().zones[camera] = zones;
            },
            async getMasks(camera) {
                await simulate();
                return getDb().masks[camera] ?? [];
            },
            async putMasks(camera, masks) {
                await simulate();
                getDb().masks[camera] = masks;
            },
        },

        notifications: {
            async getRules() {
                await simulate();
                const db = getDb();
                if (!db.rules) db.rules = DEFAULT_NOTIFICATION_RULES.map((rule) => ({ ...rule }));
                return db.rules.map((rule) => ({ ...rule }));
            },
            async putRules(rules) {
                await simulate();
                getDb().rules = rules.map((rule) => ({ ...rule }));
            },
            async snooze(minutes) {
                await simulate();
                getDb().snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
                return { snoozed_until: getDb().snoozedUntil };
            },
            async test() {
                await simulate();
            },
        },

        devices: {
            async register() {
                await simulate();
                return { id: 1 };
            },
            async unregister() {
                await simulate({ canFail: false });
            },
        },

        /** Test seam. */
        __reset: resetDb,
    };
}

function defaultZones(camera) {
    if (camera === 'achtertuin') {
        return [{ name: 'tuin', color: '#6cc070', objects: ['person'], points: [{ x: 0.1, y: 0.4 }, { x: 0.9, y: 0.4 }, { x: 0.9, y: 0.95 }, { x: 0.1, y: 0.95 }] }];
    }
    return [
        { name: 'pad', color: '#f2b134', objects: ['person', 'bicycle'], points: [{ x: 0.30, y: 1.0 }, { x: 0.44, y: 0.58 }, { x: 0.62, y: 0.58 }, { x: 0.72, y: 1.0 }] },
        { name: 'straat', color: '#4f9bd9', objects: ['car', 'motorcycle'], points: [{ x: 0.0, y: 0.50 }, { x: 1.0, y: 0.50 }, { x: 1.0, y: 0.62 }, { x: 0.0, y: 0.62 }] },
    ];
}

/** A structurally valid JWT with a one-hour expiry, so the session logic behaves normally. */
function makeMockJwt() {
    const encode = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: 'edwin', exp: Math.floor(Date.now() / 1000) + 3600 })}.mock`;
}
