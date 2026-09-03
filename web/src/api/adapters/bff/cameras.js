import { getOptional, absolute } from './client.js';

const FALLBACK_CAMERA = { name: 'voordeur', display_name: 'Voordeur', width: 1920, height: 1080, retention: null };

export function createCamerasApi() {
    return {
        /**
         * HANDOFF H2. Until the endpoint exists the app still needs a camera to talk about,
         * so a 404 yields the one camera this system has rather than an empty screen.
         */
        async list() {
            try {
                const data = await getOptional('/api/cameras');
                const cameras = Array.isArray(data) ? data : (data?.cameras ?? []);
                return cameras.length ? cameras : [FALLBACK_CAMERA];
            } catch (error) {
                if (error?.code === 'not_implemented') return [FALLBACK_CAMERA];
                throw error;
            }
        },

        snapshotUrl(camera) {
            return absolute(`/api/cameras/${encodeURIComponent(camera)}/snapshot.jpg`);
        },
    };
}
