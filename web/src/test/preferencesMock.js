import { vi } from 'vitest';

/**
 * An in-memory stand-in for Capacitor Preferences, so the auth store and the axios
 * interceptors can be tested without a device.
 */
export function createPreferencesMock(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: vi.fn(async ({ key }) => ({ value: store.has(key) ? store.get(key) : null })),
        set: vi.fn(async ({ key, value }) => {
            store.set(key, String(value));
        }),
        remove: vi.fn(async ({ key }) => {
            store.delete(key);
        }),
        clear: vi.fn(async () => store.clear()),
    };
}
