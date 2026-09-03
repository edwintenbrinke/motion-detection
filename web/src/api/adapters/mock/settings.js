/**
 * The knobs behind Settings -> Mock. Latency, failures and the media TTL are what make the
 * skeletons, the stale banner, the `@error` thumbnail recovery and the live ladder's descent
 * reviewable deliberately rather than by luck.
 */
const KEY = 'mock.settings';

const DEFAULTS = {
    latencyMs: 220,
    jitterMs: 120,
    failureRate: 0,
    offline: false,
    /** Seconds. Set it to ~20 to watch signed URLs expire while you scroll. */
    mediaTtlSeconds: 600,
    /** Live rungs that should refuse to connect, e.g. ['webrtc', 'mse']. */
    failRungs: [],
    /** Pretend new events keep arriving, so the "nieuwe events" pill has something to show. */
    liveEvents: true,
};

let cache = null;

function read() {
    if (cache) return cache;
    try {
        const stored = globalThis.localStorage?.getItem(KEY);
        cache = stored ? { ...DEFAULTS, ...JSON.parse(stored) } : { ...DEFAULTS };
    } catch {
        cache = { ...DEFAULTS };
    }
    return cache;
}

export function getMockSettings() {
    return { ...read() };
}

export function setMockSettings(patch) {
    cache = { ...read(), ...patch };
    try {
        globalThis.localStorage?.setItem(KEY, JSON.stringify(cache));
    } catch {
        // A private window without storage still gets a working session, just not a sticky one.
    }
    return { ...cache };
}

export function resetMockSettings() {
    cache = { ...DEFAULTS };
    try {
        globalThis.localStorage?.removeItem(KEY);
    } catch {
        /* ignore */
    }
    return { ...cache };
}

export const MOCK_DEFAULTS = DEFAULTS;
