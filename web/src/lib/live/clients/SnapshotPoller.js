/**
 * The bottom rung: a still image, refreshed once a second.
 *
 * Not really live, and it says so. It exists because a camera app that shows nothing is
 * worse than one that shows a picture from a second ago, and because it works on networks
 * where every streaming protocol is blocked.
 *
 * Draws into an <img>, not the <video>, so the ladder swaps which element is visible.
 */
const MAX_CONSECUTIVE_ERRORS = 5;

export class SnapshotPoller {
    constructor(emit, videoEl, imgEl) {
        this.emit = emit;
        this.img = imgEl;
        this.timer = null;
        this.errors = 0;
        this.gotFirst = false;
        this.stopped = false;
    }

    async start(rung) {
        this.stopped = false;
        this.url = rung.url;
        this.interval = rung.interval_ms ?? 1000;
        this.tick();
    }

    tick() {
        if (this.stopped) return;

        // Preload into a detached image and swap only once it has decoded, so the visible
        // frame never blanks between refreshes.
        const next = new Image();

        next.onload = () => {
            if (this.stopped) return;
            this.errors = 0;
            if (this.img) this.img.src = next.src;

            if (!this.gotFirst) {
                this.gotFirst = true;
                this.emit('firstFrame');
            }
            this.schedule();
        };

        next.onerror = () => {
            if (this.stopped) return;
            this.errors += 1;
            if (this.errors >= MAX_CONSECUTIVE_ERRORS) {
                this.emit('error', new Error('Snapshot niet bereikbaar'));
                return;
            }
            this.schedule();
        };

        // Cache-bust: the whole point is a different picture each time.
        const separator = this.url.includes('?') ? '&' : '?';
        next.src = this.url.startsWith('data:') ? this.url : `${this.url}${separator}t=${Date.now()}`;
    }

    schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.tick(), this.interval);
    }

    async stop() {
        this.stopped = true;
        clearTimeout(this.timer);
        this.timer = null;
    }
}
