import { waitForFirstFrame } from '../firstFrame.js';

/**
 * LL-HLS. The rung that works on networks where nothing else does, at a few seconds.
 *
 * hls.js is not optional here: the Android WebView has no native HLS, so without it this
 * rung would silently do nothing on the one platform the app is actually for. Loaded
 * dynamically so a session that never reaches this rung never downloads it.
 */
export class HlsClient {
    constructor(emit, videoEl) {
        this.emit = emit;
        this.video = videoEl;
        this.hls = null;
    }

    async start(rung, { signal } = {}) {
        const { default: Hls } = await import('hls.js');

        if (Hls.isSupported()) {
            const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, backBufferLength: 30 });
            this.hls = hls;

            hls.on(Hls.Events.ERROR, (_event, data) => {
                // Non-fatal errors are recovered internally; only fatal ones concern the ladder.
                if (data?.fatal) this.emit('error', new Error(data.details ?? 'HLS-fout'));
            });

            hls.on(Hls.Events.MANIFEST_PARSED, () => this.video.play().catch(() => {}));

            hls.loadSource(rung.url);
            hls.attachMedia(this.video);
        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            this.video.src = rung.url;
            this.video.play().catch(() => {});
        } else {
            throw new Error('HLS wordt hier niet ondersteund');
        }

        waitForFirstFrame(this.video, { signal })
            .then(() => this.emit('firstFrame'))
            .catch(() => {});
    }

    async stop() {
        this.hls?.destroy();
        this.hls = null;

        if (this.video) {
            this.video.removeAttribute('src');
            this.video.load();
        }
    }
}
