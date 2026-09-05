/**
 * The shape the app codes against, independent of which adapter produced it.
 *
 * Keys stay snake_case because that is what the BFF's EventOutputDTO already emits and what
 * the existing components already read; renaming them would buy nothing but a diff.
 *
 * @typedef {Object} EventMedia
 * @property {string|null} thumbnail  Signed URL for the feed thumbnail
 * @property {string|null} snapshot   Signed URL for the full still
 * @property {string|null} clip       Signed URL for the mp4. Progressive, NOT seekable
 * @property {string|null} clip_hls   Signed HLS playlist for the same window. Seekable
 * @property {string|null} expires_at ISO timestamp; all three expire together
 *
 * @typedef {Object} MotionEvent
 * @property {string} id
 * @property {string} camera
 * @property {'alert'|'detection'} severity
 * @property {string|null} label
 * @property {string|null} sub_label
 * @property {string[]} zones
 * @property {string[]} derived_tags
 * @property {number|null} top_score
 * @property {string} started_at
 * @property {string|null} ended_at
 * @property {number|null} duration_s
 * @property {boolean} has_clip
 * @property {boolean} has_snapshot
 * @property {string|null} title
 * @property {string|null} description
 * @property {'normal'|'suspicious'|'dangerous'|null} genai_severity
 * @property {boolean} seen
 * @property {EventMedia} media
 */

export const EMPTY_MEDIA = Object.freeze({
    thumbnail: null,
    snapshot: null,
    clip: null,
    clip_hls: null,
    clip_duration_s: null,
    expires_at: null,
});

const asArray = (value) => (Array.isArray(value) ? value.filter((v) => v != null && v !== '') : []);
const asNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * @param {object} raw
 * @returns {MotionEvent}
 */
export function normaliseEvent(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new TypeError('normaliseEvent expected an object');
    }

    const started = raw.started_at ?? null;
    const ended = raw.ended_at ?? null;

    return {
        id: String(raw.id),
        camera: raw.camera ?? '',
        severity: raw.severity === 'alert' ? 'alert' : 'detection',
        label: raw.label ?? null,
        sub_label: raw.sub_label ?? null,
        zones: asArray(raw.zones),
        derived_tags: asArray(raw.derived_tags),
        top_score: asNumber(raw.top_score),
        started_at: started,
        ended_at: ended,
        duration_s: durationSeconds(started, ended),
        has_clip: Boolean(raw.has_clip),
        has_snapshot: Boolean(raw.has_snapshot),
        title: raw.title ?? null,
        description: raw.description ?? null,
        genai_severity: raw.genai_severity ?? null,
        seen: Boolean(raw.seen),
        media: normaliseMedia(raw.media),
    };
}

export function normaliseMedia(raw) {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_MEDIA };
    return {
        thumbnail: raw.thumbnail ?? null,
        snapshot: raw.snapshot ?? null,
        clip: raw.clip ?? null,
        // The playlist for the same window, which is the one the player should prefer: the
        // mp4 is a progressive mux with no Range support and no duration, so it cannot be
        // seeked. Null from an API that does not serve one yet, and the player falls back
        // to the mp4 -- unseekable, but it plays.
        // See docs/v2/13-timeline-and-players.md#b1.
        clip_hls: raw.clip_hls ?? null,
        // The clip is padded either side of the event, so its length is not the event's.
        // Null from an API that does not pad; the player falls back to duration_s.
        clip_duration_s: asNumber(raw.clip_duration_s),
        expires_at: raw.expires_at ?? null,
    };
}

/** @returns {{events: MotionEvent[], next_cursor: string|null}} */
export function normalisePage(raw) {
    const events = Array.isArray(raw?.events) ? raw.events.map(normaliseEvent) : [];
    return { events, next_cursor: raw?.next_cursor ?? null };
}

function durationSeconds(started, ended) {
    if (!started || !ended) return null;
    const from = Date.parse(started);
    const to = Date.parse(ended);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    return Math.round((to - from) / 1000);
}

// -- Media freshness ---------------------------------------------------------------------
//
// Signed media URLs live ten minutes (MediaTokenService). A feed that has been scrolled for
// a while has not. Rather than tracking every URL, the app asks one question before binding
// anything expensive, and recovers reactively for the cheap ones (a broken <img>).

/** Refresh this far ahead of the real expiry, so a slow request still lands in time. */
export const MEDIA_STALE_MARGIN_MS = 60_000;

export function isMediaStale(media, now = Date.now(), margin = MEDIA_STALE_MARGIN_MS) {
    const expiresAt = media?.expires_at;
    // No expiry means we cannot vouch for it. Treat that as stale: the caller refreshes,
    // which is cheap, instead of binding a URL that may already be dead.
    if (!expiresAt) return true;
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed)) return true;
    return parsed - now < margin;
}

// -- Timeline ----------------------------------------------------------------------------
//
// The scrubber is pure maths on milliseconds (components/timeline/useTimelineGeometry.js).
// It should never have been handed a string to parse: the BFF sent unix seconds, every
// caller ran `Date.parse()` on them, and NaN drew an empty strip without raising anything.
// Parsing happens here instead, once, with a test -- see docs/v2/13-timeline-and-players.md.

/**
 * Milliseconds since the epoch, from unix seconds, milliseconds, or an ISO string.
 *
 * Both shapes are accepted deliberately: the API now sends ATOM, older deployments send
 * numbers, and the mock sends ISO. A normaliser that only understood the newest of the
 * three would put the app back in the state this function exists to fix.
 *
 * @returns {number|null} null when there is nothing usable, never NaN.
 */
export function asEpochMs(value) {
    if (value === null || value === undefined || value === '') return null;

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        // 1e11 ms is 1973 and 1e11 s is the year 5138, so nothing real is ambiguous.
        return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
    }

    if (typeof value !== 'string') return null;

    // A numeric string is still a number; `Date.parse` would answer NaN for it.
    if (/^-?\d+(\.\d+)?$/.test(value)) return asEpochMs(Number(value));

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
}

/**
 * One day of timeline, in the shape the strip actually wants.
 *
 * Ranges whose times do not normalise are dropped rather than passed through: one malformed
 * span should cost you that span, not the whole day.
 *
 * @returns {{camera: string, date: string, expires_at: string|null,
 *            recordings: Array<{start_ms: number, end_ms: number, vod_url: string}>,
 *            previews: Array<{start_ms: number, end_ms: number, preview_url: string}>,
 *            events: Array<{id: string, start_ms: number, end_ms: number|null, label: string|null, severity: string}>}}
 */
export function normaliseTimelineDay(raw, camera = '', date = '') {
    const spans = (list, urlKey) =>
        (Array.isArray(list) ? list : [])
            .map((item) => {
                const start_ms = asEpochMs(item?.start ?? item?.start_ms);
                const end_ms = asEpochMs(item?.end ?? item?.end_ms);
                if (start_ms === null || end_ms === null || end_ms <= start_ms) return null;
                return { start_ms, end_ms, [urlKey]: item?.[urlKey] ?? null };
            })
            .filter((item) => item !== null && item[urlKey])
            .sort((a, b) => a.start_ms - b.start_ms);

    const events = (Array.isArray(raw?.events) ? raw.events : [])
        .map((item) => {
            const start_ms = asEpochMs(item?.start ?? item?.start_ms ?? item?.started_at);
            if (start_ms === null || item?.id === undefined || item?.id === null) return null;
            return {
                id: String(item.id),
                start_ms,
                // An event that has not ended yet has no end, which is different from a
                // broken one; both normalise to null and neither is drawn as a span.
                end_ms: asEpochMs(item?.end ?? item?.end_ms ?? item?.ended_at),
                label: item?.label ?? null,
                severity: item?.severity === 'alert' ? 'alert' : 'detection',
            };
        })
        .filter((event) => event !== null)
        .sort((a, b) => a.start_ms - b.start_ms);

    return {
        camera: raw?.camera ?? camera,
        date: raw?.date ?? date,
        expires_at: raw?.expires_at ?? null,
        recordings: spans(raw?.recordings, 'vod_url'),
        previews: spans(raw?.previews, 'preview_url'),
        events,
    };
}

// -- Live sources ------------------------------------------------------------------------

const RUNG_TYPES = ['webrtc', 'mse', 'hls', 'snapshot', 'file'];

/**
 * Accepts both the ordered `rungs[]` this app asks for and the flatter
 * `{whep_url, ice_servers, fallbacks[]}` shape written in docs/v2/07-api-and-data-model.md,
 * so whichever one the BFF ends up serving, the ladder gets the same list.
 *
 * @returns {{camera: string, expires_at: string|null, rungs: Array<object>}}
 */
export function normaliseLiveSource(raw, camera = '') {
    if (!raw || typeof raw !== 'object') {
        return { camera, expires_at: null, rungs: [] };
    }

    const rungs = Array.isArray(raw.rungs) ? raw.rungs.map(normaliseRung) : legacyRungs(raw);

    return {
        camera: raw.camera ?? camera,
        expires_at: raw.expires_at ?? null,
        rungs: rungs.filter((rung) => rung && RUNG_TYPES.includes(rung.type)),
    };
}

function normaliseRung(raw) {
    if (!raw?.type) return null;
    return {
        type: raw.type,
        url: raw.url ?? null,
        ice_servers: Array.isArray(raw.ice_servers) ? raw.ice_servers : [],
        interval_ms: Number.isFinite(Number(raw.interval_ms)) ? Number(raw.interval_ms) : 1000,
    };
}

function legacyRungs(raw) {
    const rungs = [];
    if (raw.whep_url) {
        rungs.push(normaliseRung({ type: 'webrtc', url: raw.whep_url, ice_servers: raw.ice_servers }));
    }
    for (const fallback of Array.isArray(raw.fallbacks) ? raw.fallbacks : []) {
        rungs.push(normaliseRung(typeof fallback === 'string' ? { type: fallback } : fallback));
    }
    return rungs;
}

// -- Cursors -----------------------------------------------------------------------------

/**
 * The feed pages by cursor, not offset, because new events arrive while you scroll and an
 * offset would shift under the reader. The encoding matches the BFF's:
 * base64("started_at|id").
 */
export function encodeCursor(startedAt, id) {
    return btoa(`${startedAt}|${id}`);
}

export function decodeCursor(cursor) {
    if (!cursor) return null;
    try {
        const decoded = atob(cursor);
        const separator = decoded.indexOf('|');
        if (separator === -1) return null;
        const startedAt = decoded.slice(0, separator);
        const id = decoded.slice(separator + 1);
        if (!startedAt || !id || !Number.isFinite(Date.parse(startedAt))) return null;
        return { startedAt, id };
    } catch {
        // A tampered or truncated cursor restarts the feed rather than throwing at the user.
        return null;
    }
}
