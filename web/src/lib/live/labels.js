/**
 * What the badge says.
 *
 * docs/v2/02-video-transport.md: "Show which rung you are on in the UI; a live view that is
 * silently 5 seconds behind is worse than one that says so." Remote sessions land on MSE
 * because WebRTC cannot negotiate through the Cloudflare Tunnel, and that has to read as
 * normal rather than broken -- hence a latency figure on every rung instead of a warning.
 */
export const RUNG_LABELS = {
    webrtc: 'Live · WebRTC',
    mse: 'Live · ~1 s',
    hls: 'Vertraagd · ~3 s',
    snapshot: 'Stilstaand beeld',
    file: 'Demo · loop',
};

const CONNECTING_LABELS = {
    webrtc: 'Verbinden… (WebRTC)',
    mse: 'Verbinden… (MSE)',
    hls: 'Verbinden… (HLS)',
    snapshot: 'Beeld ophalen…',
    file: 'Demo laden…',
};

/** 'good' | 'ok' | 'poor' -- drives the badge colour. */
export const RUNG_QUALITY = {
    webrtc: 'good',
    mse: 'good',
    hls: 'ok',
    snapshot: 'poor',
    file: 'ok',
};

export function stateLabel(state) {
    switch (state.phase) {
        case 'idle':
            return 'Niet verbonden';
        case 'connecting':
            return CONNECTING_LABELS[state.rung?.type] ?? 'Verbinden…';
        case 'playing':
            return RUNG_LABELS[state.rung?.type] ?? 'Live';
        case 'stalled':
            return 'Verbinding hapert…';
        case 'exhausted':
            return 'Geen verbinding';
        case 'stopped':
            return 'Gestopt';
        default:
            return '';
    }
}

export function stateQuality(state) {
    if (state.phase === 'playing') return RUNG_QUALITY[state.rung?.type] ?? 'ok';
    if (state.phase === 'exhausted') return 'poor';
    return 'ok';
}
