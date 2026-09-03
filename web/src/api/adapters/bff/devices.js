import { post, del } from './client.js';

export function createDevicesApi() {
    return {
        /**
         * Note for whoever debugs this later: the API currently drops `app_version`. Its
         * serializer converts the key to `appVersion`, which DeviceInputDTO has neither as
         * a property nor a setter, so it lands as null -- and overwrites a previously
         * stored value on re-registration. HANDOFF H10. Sent as documented regardless.
         */
        async register({ token, platform, app_version }) {
            return await post('/api/devices', { token, platform, app_version });
        },

        async unregister(id) {
            await del(`/api/devices/${encodeURIComponent(id)}`);
        },
    };
}
