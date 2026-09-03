/**
 * Typed access to the handful of build-time settings, with the defaults in one place
 * instead of scattered `import.meta.env.X || 5` expressions.
 */

/* global __APP_VERSION__ */

export const API_MODE = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'bff';
export const IS_MOCK = API_MODE === 'mock';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

/** Minutes in the background before the app asks for the fingerprint again. */
export const DEFAULT_RELOCK_MINUTES = (() => {
    const parsed = Number.parseInt(import.meta.env.VITE_RELOCK_MINUTES ?? '5', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
})();

export const MOCK_SEED = (() => {
    const parsed = Number.parseInt(import.meta.env.VITE_MOCK_SEED ?? '1337', 10);
    return Number.isFinite(parsed) ? parsed : 1337;
})();
