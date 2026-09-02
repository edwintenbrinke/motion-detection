/**
 * Push-device registration. See docs/v2/04-notifications.md#device-registration and
 * src/api/eventsApi.js for why this thin layer exists at all.
 */
import { apiClient } from '@/plugins/axios.js';

/**
 * @param {{token: string, platform: 'android'|'ios'|'web', app_version?: string}} device
 */
export async function registerDevice(device) {
    const response = await apiClient.post('/api/devices', device);
    return response.data;
}

export async function unregisterDevice(id) {
    await apiClient.delete(`/api/devices/${encodeURIComponent(id)}`);
}
