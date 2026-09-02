/**
 * Thin API-client layer for the event feed. See docs/v2/05-android-app.md:
 *
 *   "the API client is a thin layer you can swap later... Frigate's HTTP API is
 *   available as soon as Phase 2 lands, so the events feed... can be built against
 *   Frigate directly and re-pointed at the BFF later — as long as the API client is a
 *   thin layer you can swap. Build that layer first."
 *
 * Every other view in this app calls `this.$api.get(url)` directly with a hardcoded
 * URL (see CalendarDayView.vue). That's fine for the existing calendar/hour endpoints,
 * which are frozen (see docs/v2/07-api-and-data-model.md, "Archive") -- but the events
 * feed is new and the backend behind it is still moving (motion-api today, possibly
 * Frigate directly for a while, see docs/v2/adr/0006-keep-symfony-bff.md), so it gets
 * this one extra layer of indirection on purpose. Nothing above the store should ever
 * import axios or build a URL itself.
 */
import { apiClient } from '@/plugins/axios.js';

/**
 * @param {object} options
 * @param {string|null} options.cursor
 * @param {number} [options.limit]
 * @param {string[]} [options.cameras]
 * @param {string[]} [options.labels]
 * @param {string[]} [options.zones]
 * @param {string|null} [options.severity]
 * @param {string|null} [options.q]
 * @returns {Promise<{events: Array<object>, next_cursor: string|null}>}
 */
export async function fetchEventFeed({ cursor = null, limit = 25, cameras = [], labels = [], zones = [], severity = null, q = null } = {}) {
    const params = { limit };
    if (cursor) params.cursor = cursor;
    if (cameras.length) params.cameras = cameras;
    if (labels.length) params.labels = labels;
    if (zones.length) params.zones = zones;
    if (severity) params.severity = severity;
    if (q) params.q = q;

    const response = await apiClient.get('/api/events', { params });
    return response.data;
}

/**
 * @returns {Promise<object>}
 */
export async function fetchEvent(id) {
    const response = await apiClient.get(`/api/events/${encodeURIComponent(id)}`);
    return response.data;
}

/**
 * @returns {Promise<number>}
 */
export async function fetchUnreadCount() {
    const response = await apiClient.get('/api/events/unread-count');
    return response.data.count;
}

export async function markEventSeen(id) {
    await apiClient.post(`/api/events/${encodeURIComponent(id)}/seen`);
}

/**
 * The "dit klopt niet" button. See docs/v2/05-android-app.md#event-detail --
 * deliberately not wired into anything on the backend yet beyond storing the text; the
 * point is to start collecting it now.
 */
export async function sendEventFeedback(id, feedback) {
    await apiClient.post(`/api/events/${encodeURIComponent(id)}/feedback`, { feedback });
}
