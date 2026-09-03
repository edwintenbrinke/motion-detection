import { waitForFirstFrame } from '../firstFrame.js';

/**
 * MSE over WebSocket, speaking go2rtc's protocol.
 *
 * The rung that matters most in practice: it works anywhere plain HTTP works, including
 * through the Cloudflare Tunnel, at roughly a second. Remote sessions live here
 * (docs/v2/02-video-transport.md, "Remote access").
 *
 * The handshake: send the codecs this browser can play, receive a mime string, then a stream
 * of binary fMP4 fragments to append.
 */
const CANDIDATE_CODECS = [
    'avc1.640029',
    'avc1.64002A',
    'avc1.640033',
    'avc1.42E01E',
    'hvc1.1.6.L153.B0',
    'mp4a.40.2',
    'opus',
];

/** Seek forward if we drift this far behind live; live video is worthless when late. */
const MAX_LAG_S = 2;
/** Keep at most this much history buffered, or a long session grows without bound. */
const MAX_BUFFER_S = 60;

export class MseClient {
    constructor(emit, videoEl) {
        this.emit = emit;
        this.video = videoEl;
        this.ws = null;
        this.mediaSource = null;
        this.sourceBuffer = null;
        this.queue = [];
        this.objectUrl = null;
    }

    static supportedCodecs() {
        return CANDIDATE_CODECS.filter((codec) => {
            const mime = codec.startsWith('avc1') || codec.startsWith('hvc1')
                ? `video/mp4; codecs="${codec}"`
                : `audio/mp4; codecs="${codec}"`;
            return globalThis.MediaSource?.isTypeSupported?.(mime);
        }).join(',');
    }

    async start(rung, { signal } = {}) {
        if (!globalThis.MediaSource) {
            throw new Error('MediaSource wordt hier niet ondersteund');
        }

        const ws = new WebSocket(rung.url);
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        signal?.addEventListener('abort', () => this.stop(), { once: true });

        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', () => reject(new Error('WebSocket kon niet openen')), { once: true });
            signal?.addEventListener('abort', () => reject(new DOMException('Afgebroken', 'AbortError')), { once: true });
        });

        ws.send(JSON.stringify({ type: 'mse', value: MseClient.supportedCodecs() }));

        ws.addEventListener('message', (event) => this.onMessage(event));
        ws.addEventListener('close', () => this.emit('error', new Error('WebSocket gesloten')));
        ws.addEventListener('error', () => this.emit('error', new Error('WebSocket-fout')));

        waitForFirstFrame(this.video, { signal })
            .then(() => this.emit('firstFrame'))
            .catch(() => {});
    }

    onMessage(event) {
        if (typeof event.data === 'string') {
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }

            if (message.type === 'error') {
                this.emit('error', new Error(message.value ?? 'go2rtc-fout'));
                return;
            }

            if (message.type === 'mse' && message.value) {
                this.openMediaSource(message.value);
            }
            return;
        }

        this.queue.push(event.data);
        this.drain();
    }

    openMediaSource(mimeCodec) {
        const mediaSource = new MediaSource();
        this.mediaSource = mediaSource;
        this.objectUrl = URL.createObjectURL(mediaSource);
        this.video.src = this.objectUrl;

        mediaSource.addEventListener(
            'sourceopen',
            () => {
                try {
                    const sourceBuffer = mediaSource.addSourceBuffer(mimeCodec);
                    // Fragments arrive already timed; 'segments' keeps their own timestamps.
                    sourceBuffer.mode = 'segments';
                    sourceBuffer.addEventListener('updateend', () => this.drain());
                    this.sourceBuffer = sourceBuffer;
                    this.drain();
                    this.video.play().catch(() => {});
                } catch (error) {
                    this.emit('error', error);
                }
            },
            { once: true },
        );
    }

    drain() {
        const sourceBuffer = this.sourceBuffer;
        if (!sourceBuffer || sourceBuffer.updating || this.queue.length === 0) return;

        try {
            sourceBuffer.appendBuffer(this.queue.shift());
        } catch (error) {
            this.emit('error', error);
            return;
        }

        this.keepUp();
    }

    /**
     * A paused tab, a slow decode or a burst of fragments all leave the playhead behind the
     * live edge, and MSE will happily play a minute-old "live" stream forever. Jump forward
     * rather than drift, and drop the history nobody can scrub anyway.
     */
    keepUp() {
        const el = this.video;
        const buffered = this.sourceBuffer?.buffered;
        if (!el || !buffered?.length) return;

        const end = buffered.end(buffered.length - 1);
        if (end - el.currentTime > MAX_LAG_S) {
            el.currentTime = end - 0.5;
        }

        const start = buffered.start(0);
        if (el.currentTime - start > MAX_BUFFER_S && !this.sourceBuffer.updating) {
            try {
                this.sourceBuffer.remove(start, el.currentTime - 30);
            } catch {
                // Removing while the browser is busy is not worth failing the stream over.
            }
        }
    }

    async stop() {
        this.queue = [];

        if (this.ws) {
            // Drop the handlers first, or closing the socket emits an error at a ladder
            // that has already moved on.
            this.ws.onclose = null;
            this.ws.onerror = null;
            if (this.ws.readyState <= WebSocket.OPEN) this.ws.close();
            this.ws = null;
        }

        this.sourceBuffer = null;
        this.mediaSource = null;

        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }

        if (this.video) {
            this.video.removeAttribute('src');
            this.video.load();
        }
    }
}
