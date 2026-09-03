import { getOptional, absolute } from './client.js';
import { normaliseLiveSource } from '@/api/contract.js';

export function createLiveApi() {
    return {
        /** HANDOFF H3. */
        async getSource(camera) {
            const raw = await getOptional(`/api/cameras/${encodeURIComponent(camera)}/live`);
            const source = normaliseLiveSource(raw, camera);
            return {
                ...source,
                rungs: source.rungs.map((rung) => ({ ...rung, url: absolute(rung.url) })),
            };
        },
    };
}
