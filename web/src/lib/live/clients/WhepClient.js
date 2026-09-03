import { waitForFirstFrame } from '../firstFrame.js';

/**
 * WebRTC via WHEP against the go2rtc bundled in Frigate.
 *
 * The primary rung on the LAN, and only there: WebRTC needs a UDP or direct-TCP path, which
 * an HTTP-only tunnel cannot provide (docs/v2/adr/0003, 0004). Off the LAN this fails and
 * the ladder drops to MSE, which is the designed behaviour, not a fault.
 */
export class WhepClient {
    constructor(emit, videoEl) {
        this.emit = emit;
        this.video = videoEl;
        this.pc = null;
        this.resourceUrl = null;
    }

    async start(rung, { signal } = {}) {
        const pc = new RTCPeerConnection({ iceServers: rung.ice_servers ?? [] });
        this.pc = pc;

        // Receive only, and video only: this camera has no microphone, so asking for audio
        // negotiates a track that will never carry anything.
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
            if (this.video && event.streams[0]) {
                this.video.srcObject = event.streams[0];
                this.video.play().catch(() => {});
            }

            const track = event.track;
            if (track.muted) {
                track.addEventListener('unmute', () => this.emit('firstFrame'), { once: true });
            } else {
                this.emit('firstFrame');
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.emit('error', new Error(`WebRTC ${pc.connectionState}`));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await this.waitForIce(pc, signal);

        const response = await fetch(rung.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/sdp' },
            body: pc.localDescription.sdp,
            signal,
        });

        if (!response.ok) {
            throw new Error(`WHEP antwoordde ${response.status}`);
        }

        // The Location header names the session, so it can be torn down server-side rather
        // than left to time out.
        this.resourceUrl = response.headers.get('Location');

        const answer = await response.text();
        await pc.setRemoteDescription({ type: 'answer', sdp: answer });

        // Belt and braces: some builds deliver frames without ever unmuting the track.
        waitForFirstFrame(this.video, { signal })
            .then(() => this.emit('firstFrame'))
            .catch(() => {});
    }

    /** Wait for candidate gathering, but never longer than a second: trickle can wait. */
    waitForIce(pc, signal) {
        if (pc.iceGatheringState === 'complete') return Promise.resolve();

        return new Promise((resolve) => {
            const done = () => {
                clearTimeout(timeout);
                pc.removeEventListener('icegatheringstatechange', onChange);
                resolve();
            };
            const onChange = () => {
                if (pc.iceGatheringState === 'complete') done();
            };
            const timeout = setTimeout(done, 1000);

            pc.addEventListener('icegatheringstatechange', onChange);
            signal?.addEventListener('abort', done, { once: true });
        });
    }

    async stop() {
        if (this.resourceUrl) {
            // Fire and forget: we are leaving either way.
            fetch(this.resourceUrl, { method: 'DELETE' }).catch(() => {});
            this.resourceUrl = null;
        }

        this.pc?.close();
        this.pc = null;

        if (this.video) {
            this.video.srcObject = null;
        }
    }
}
