import { waitForFirstFrame } from '../firstFrame.js';

/**
 * A looping local file.
 *
 * Only the mock adapter offers this rung. It exists so the live screen -- the badge, the
 * controls, the lifecycle stop/resume, the descent through the ladder -- can be built and
 * reviewed today, with no Frigate, no go2rtc and no Pi.
 */
export class FileClient {
    constructor(emit, videoEl) {
        this.emit = emit;
        this.video = videoEl;
    }

    async start(rung, { signal } = {}) {
        const el = this.video;
        if (!el) throw new Error('Geen video-element');

        el.src = rung.url;
        el.loop = true;
        // Muted, or the browser refuses to autoplay it.
        el.muted = true;
        el.playsInline = true;

        waitForFirstFrame(el, { signal })
            .then(() => this.emit('firstFrame'))
            .catch(() => {});

        await el.play().catch(() => {
            // Autoplay refused. The frame still decodes, so the ladder is satisfied.
        });
    }

    async stop() {
        if (!this.video) return;
        this.video.pause();
        this.video.loop = false;
        this.video.removeAttribute('src');
        this.video.load();
    }
}
