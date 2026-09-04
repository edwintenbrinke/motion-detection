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

/**
 * Drift handling, in two bands.
 *
 * A hard seek on a live MSE stream is a visible hitch. The old code seeked whenever the
 * buffer ran 2 s ahead, from `drain()`, which runs after *every* appended fragment --
 * and fragments arrive in bursts through a tunnel, so it seeked constantly. That is what
 * "smooth the first time, choppy after a refresh" was: a fresh connection starts at the
 * live edge with nothing buffered; a reconnect to a running stream gets a backlog at once.
 *
 * So: close small drift by playing slightly faster, which is invisible, and keep the seek
 * for a gap no amount of catching up will close.
 */
const NUDGE_LAG_S = 1.5;
const SEEK_LAG_S = 10;
const NUDGE_RATE = 1.05;
/** At most one correction per this long, however many fragments arrive. */
const KEEPUP_INTERVAL_MS = 3000;
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
        this.listeners = null;
        this.lastKeepUp = 0;
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

        // Every listener below is bound to this controller, so `stop()` removes all of them
        // with a single abort. The previous version set `ws.onclose = null`, which removes
        // nothing at all from a listener added with addEventListener -- so closing the
        // socket still fired an error into a ladder that had already moved on, and a
        // refresh is exactly the moment that window is open.
        this.listeners = new AbortController();
        const opts = { signal: this.listeners.signal };

        signal?.addEventListener('abort', () => this.stop(), { once: true });

        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true, ...opts });
            ws.addEventListener('error', () => reject(new Error('WebSocket kon niet openen')), { once: true, ...opts });
            signal?.addEventListener('abort', () => reject(new DOMException('Afgebroken', 'AbortError')), { once: true });
        });

        ws.send(JSON.stringify({ type: 'mse', value: MseClient.supportedCodecs() }));

        ws.addEventListener('message', (event) => this.onMessage(event), opts);
        ws.addEventListener('close', () => this.emit('error', new Error('WebSocket gesloten')), opts);
        ws.addEventListener('error', () => this.emit('error', new Error('WebSocket-fout')), opts);

        // The ladder has a complete stall-recovery path that nothing ever triggered: no
        // client emitted these. A stream that is degraded but not dead -- the choppy case --
        // was therefore invisible to it.
        this.video.addEventListener('waiting', () => this.emit('stalled'), opts);
        this.video.addEventListener('stalled', () => this.emit('stalled'), opts);
        this.video.addEventListener('playing', () => this.emit('resumed'), opts);

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

        const now = Date.now();
        if (now - this.lastKeepUp < KEEPUP_INTERVAL_MS) return;
        this.lastKeepUp = now;

        // Correcting a stream that is not actually playing turns a buffering pause into a
        // jump, which is the same hitch for a worse reason.
        if (el.paused || el.readyState < 3) return;

        const end = buffered.end(buffered.length - 1);
        const lag = end - el.currentTime;

        if (lag > SEEK_LAG_S) {
            // Far enough behind that no rate can close it. This is a desync, not jitter.
            el.currentTime = end - 0.5;
            el.playbackRate = 1;
        } else if (lag > NUDGE_LAG_S) {
            el.playbackRate = NUDGE_RATE;
        } else if (el.playbackRate !== 1) {
            el.playbackRate = 1;
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

        // One abort removes every listener registered in start(), including the close
        // handler that would otherwise report an error about a socket we closed ourselves.
        this.listeners?.abort();
        this.listeners = null;

        if (this.ws) {
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
