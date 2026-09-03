import { createLadder } from './ladder.js';
import { WhepClient } from './clients/WhepClient.js';
import { MseClient } from './clients/MseClient.js';
import { HlsClient } from './clients/HlsClient.js';
import { SnapshotPoller } from './clients/SnapshotPoller.js';
import { FileClient } from './clients/FileClient.js';

const CLIENTS = {
    webrtc: WhepClient,
    mse: MseClient,
    hls: HlsClient,
    snapshot: SnapshotPoller,
    file: FileClient,
};

/** Rungs that draw into the <img> rather than the <video>. */
export const IMAGE_RUNGS = new Set(['snapshot']);

/**
 * Wires the pure ladder to real DOM elements. Kept separate so the state machine itself
 * stays testable without either.
 */
export function createLivePlayer({ rungs, videoEl, imgEl, onState, ...options }) {
    return createLadder({
        rungs,
        onState,
        createClient: (type, emit) => {
            const Client = CLIENTS[type];
            if (!Client) throw new Error(`Onbekende transportsoort: ${type}`);
            return new Client(emit, videoEl, imgEl);
        },
        ...options,
    });
}

export { createLadder };
export * from './labels.js';
