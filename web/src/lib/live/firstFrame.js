/**
 * "Has a frame actually arrived?"
 *
 * Not the same question as "did the transport connect". A WebRTC session can negotiate
 * happily and never deliver a picture; an HLS manifest can parse and stall on the first
 * segment. The ladder falls through on this signal, so it has to mean pixels.
 */
export function waitForFirstFrame(el, { signal } = {}) {
    return new Promise((resolve, reject) => {
        if (!el) return reject(new Error('Geen video-element'));

        let done = false;
        const cleanup = [];

        const finish = () => {
            if (done) return;
            done = true;
            cleanup.forEach((fn) => fn());
            resolve();
        };

        // The precise answer, where it exists: fires per composited frame. Chrome and the
        // Android WebView both have it.
        if (typeof el.requestVideoFrameCallback === 'function') {
            const handle = el.requestVideoFrameCallback(finish);
            cleanup.push(() => el.cancelVideoFrameCallback?.(handle));
        }

        // Fallback: metadata alone is not enough (it arrives before any picture), so wait
        // for playback position to actually move.
        const onTimeUpdate = () => {
            if (el.currentTime > 0) finish();
        };
        el.addEventListener('timeupdate', onTimeUpdate);
        el.addEventListener('loadeddata', onTimeUpdate);
        cleanup.push(() => {
            el.removeEventListener('timeupdate', onTimeUpdate);
            el.removeEventListener('loadeddata', onTimeUpdate);
        });

        if (signal) {
            const onAbort = () => {
                if (done) return;
                done = true;
                cleanup.forEach((fn) => fn());
                reject(new DOMException('Afgebroken', 'AbortError'));
            };
            signal.addEventListener('abort', onAbort, { once: true });
            cleanup.push(() => signal.removeEventListener('abort', onAbort));
        }
    });
}
