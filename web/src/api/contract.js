/**
 * The shape the app codes against, independent of which adapter produced it.
 *
 * Keys stay snake_case because that is what the BFF's EventOutputDTO already emits and what
 * the existing components already read; renaming them would buy nothing but a diff.
 *
 * @typedef {Object} EventMedia
 * @property {string|null} thumbnail  Signed URL for the feed thumbnail
 * @property {string|null} snapshot   Signed URL for the full still
 * @property {string|null} clip       Signed URL for the mp4, Range-capable
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
