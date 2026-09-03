import { getOptional, put } from './client.js';

export function createZonesApi() {
    return {
        /** HANDOFF H9. */
        async get(camera) {
            const raw = await getOptional(`/api/cameras/${encodeURIComponent(camera)}/zones`);
            return raw?.zones ?? (Array.isArray(raw) ? raw : []);
        },

        /**
         * Point order is preserved deliberately: Frigate walks the polygon in the order it
         * is given, so reordering here would silently redraw the zone.
         */
        async put(camera, zones) {
            await put(`/api/cameras/${encodeURIComponent(camera)}/zones`, { zones }, { silent: false });
        },

        async getMasks(camera) {
            const raw = await getOptional(`/api/cameras/${encodeURIComponent(camera)}/masks`);
            return raw?.masks ?? (Array.isArray(raw) ? raw : []);
        },

        async putMasks(camera, masks) {
            await put(`/api/cameras/${encodeURIComponent(camera)}/masks`, { masks }, { silent: false });
        },
    };
}
