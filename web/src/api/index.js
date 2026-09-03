import { API_MODE } from '@/lib/env.js';
import { createBffAdapter } from './adapters/bff/index.js';
import { createMockAdapter } from './adapters/mock/index.js';

/**
 * The one place that knows which world the app is talking to.
 *
 * docs/v2/05-android-app.md: "the events feed, the timeline and the WebRTC player can all be
 * built against Frigate directly and re-pointed at the BFF later -- as long as the API client
 * is a thin layer you can swap. Build that layer first."
 *
 * That layer is this. Nothing above it imports axios or builds a URL, which is what lets the
 * whole app run against `mock` today, against the BFF tomorrow, and against a third thing
 * later without a single view changing.
 *
 * @type {ReturnType<typeof createBffAdapter>}
 */
export const api = API_MODE === 'mock' ? createMockAdapter() : createBffAdapter();

export { API_MODE };
export * from './errors.js';
export * from './contract.js';
