import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLadder } from './ladder.js';

/**
 * A client that does nothing until the test tells it to. The ladder never touches the DOM,
 * so the entire descent is testable with no media, no network and no video element.
 */
function makeHarness(rungs, overrides = {}) {
    const states = [];
    const clients = [];

    const createClient = (type, emit) => {
        const client = {
            type,
            emit,
            started: false,
            stopped: false,
            async start() {
                this.started = true;
                if (this.failOnStart) throw new Error(`${type} weigert`);
            },
            async stop() {
                this.stopped = true;
            },
        };
        clients.push(client);
        return client;
    };

    const ladder = createLadder({
        rungs,
        createClient,
        onState: (state) => states.push({ ...state }),
        ...overrides,
    });

    return {
        ladder,
        states,
        clients,
        get phases() {
            return states.map((s) => s.phase);
        },
        get attempted() {
            return clients.map((c) => c.type);
        },
        latest: () => states[states.length - 1],
    };
}

const fullLadder = [
    { type: 'webrtc', url: 'https://lan/whep' },
    { type: 'mse', url: 'wss://host/ws' },
    { type: 'hls', url: 'https://host/stream.m3u8' },
    { type: 'snapshot', url: 'https://host/latest.jpg', interval_ms: 1000 },
];

describe('live ladder', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('starts on the first rung and reports connecting', async () => {
        const h = makeHarness(fullLadder);
        await h.ladder.start();

        expect(h.latest().phase).toBe('connecting');
        expect(h.latest().rung.type).toBe('webrtc');
        expect(h.clients[0].started).toBe(true);
    });

    it('plays as soon as a frame arrives', async () => {
        const h = makeHarness(fullLadder);
        await h.ladder.start();

        h.clients[0].emit('firstFrame');

        expect(h.latest().phase).toBe('playing');
        expect(h.latest().rung.type).toBe('webrtc');
    });

    it('drops to the next rung when no frame arrives in time', async () => {
        const h = makeHarness(fullLadder);
        await h.ladder.start();

        await vi.advanceTimersByTimeAsync(3000);

        expect(h.attempted).toEqual(['webrtc', 'mse']);
        expect(h.latest().rung.type).toBe('mse');
        expect(h.clients[0].stopped).toBe(true);
    });

    it('walks the whole ladder down to snapshot when nothing works', async () => {
        const h = makeHarness(fullLadder);
        await h.ladder.start();

        await vi.advanceTimersByTimeAsync(3000);
        await vi.advanceTimersByTimeAsync(3000);
        await vi.advanceTimersByTimeAsync(3000);

        expect(h.attempted).toEqual(['webrtc', 'mse', 'hls', 'snapshot']);
    });

    it('descends immediately past a rung the server did not offer a URL for', async () => {
        const h = makeHarness([
            { type: 'webrtc', url: null },
            { type: 'mse', url: null },
            { type: 'hls', url: 'https://host/stream.m3u8' },
        ]);
        await h.ladder.start();

        // No timers advanced: an unusable rung must not cost three seconds each.
        expect(h.attempted).toEqual(['hls']);
        expect(h.latest().rung.type).toBe('hls');
    });

    it('descends when a client refuses to start', async () => {
        const h = makeHarness(fullLadder);
        h.ladder.start();
        await vi.advanceTimersByTimeAsync(0);

        // The first client threw synchronously inside start(); simulate by failing it.
        const first = h.clients[0];
        first.emit('error', new Error('ICE mislukt'));
        await vi.advanceTimersByTimeAsync(0);

        expect(h.attempted).toEqual(['webrtc', 'mse']);
    });

    describe('a rung that was working and then fails', () => {
        it('retries the same rung with backoff before giving up on it', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            h.clients[0].emit('firstFrame');

            h.clients[0].emit('error', new Error('verbinding verbroken'));
            expect(h.latest().phase).toBe('connecting');

            await vi.advanceTimersByTimeAsync(1000);
            // Still WebRTC: a blip does not deserve a quality drop for everyone watching.
            expect(h.attempted).toEqual(['webrtc', 'webrtc']);
            expect(h.latest().rung.type).toBe('webrtc');
        });

        it('gives up on the rung after the attempt limit', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();

            const failOnce = async (backoff) => {
                const client = h.clients[h.clients.length - 1];
                client.emit('firstFrame');
                client.emit('error', new Error('weg'));
                // Exactly the backoff, so the next rung's own first-frame timer stays armed
                // and does not add descents this test is not measuring.
                await vi.advanceTimersByTimeAsync(backoff);
            };

            await failOnce(1000); // attempt 2
            await failOnce(2000); // attempt 3
            expect(h.latest().rung.type).toBe('webrtc');

            // The third failure exhausts the rung rather than retrying a fourth time.
            const last = h.clients[h.clients.length - 1];
            last.emit('firstFrame');
            last.emit('error', new Error('weg'));
            await vi.advanceTimersByTimeAsync(0);

            expect(h.latest().rung.type).toBe('mse');
            expect(h.attempted).toEqual(['webrtc', 'webrtc', 'webrtc', 'mse']);
        });

        it('treats a stall as a failure once it lasts', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            h.clients[0].emit('firstFrame');

            h.clients[0].emit('stalled');
            expect(h.latest().phase).toBe('stalled');

            await vi.advanceTimersByTimeAsync(5000);
            expect(h.latest().phase).toBe('connecting');
        });

        it('ignores a stall on a rung that was not playing', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();

            h.clients[0].emit('stalled');

            expect(h.latest().phase).toBe('connecting');
        });
    });

    describe('the bottom rung', () => {
        it('never descends past snapshot -- a still picture beats a blank screen', async () => {
            const h = makeHarness([{ type: 'snapshot', url: 'https://host/latest.jpg' }]);
            await h.ladder.start();

            for (let i = 0; i < 5; i += 1) {
                h.clients[h.clients.length - 1].emit('error', new Error('404'));
                await vi.advanceTimersByTimeAsync(5000);
            }

            expect(h.latest().phase).not.toBe('exhausted');
            expect(h.attempted.every((type) => type === 'snapshot')).toBe(true);
        });

        it('reports exhausted only when there is no rung left at all', async () => {
            const h = makeHarness([{ type: 'webrtc', url: 'https://lan/whep' }]);
            await h.ladder.start();

            await vi.advanceTimersByTimeAsync(3000);

            expect(h.latest().phase).toBe('exhausted');
        });

        it('climbs back to the top on its own after a while', async () => {
            const h = makeHarness([{ type: 'webrtc', url: 'https://lan/whep' }]);
            await h.ladder.start();
            await vi.advanceTimersByTimeAsync(3000);
            expect(h.latest().phase).toBe('exhausted');

            await vi.advanceTimersByTimeAsync(10_000);

            expect(h.latest().phase).toBe('connecting');
            expect(h.attempted).toEqual(['webrtc', 'webrtc']);
        });
    });

    describe('stop', () => {
        it('tears down the active client', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            h.clients[0].emit('firstFrame');

            await h.ladder.stop();

            expect(h.clients[0].stopped).toBe(true);
            expect(h.latest().phase).toBe('stopped');
        });

        it('silences a client that emits after being stopped', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            await h.ladder.stop();

            const countBefore = h.states.length;
            h.clients[0].emit('firstFrame');
            h.clients[0].emit('error', new Error('te laat'));

            expect(h.states.length).toBe(countBefore);
        });

        it('cancels a pending fall-through, so a stopped ladder starts no new client', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            await h.ladder.stop();

            await vi.advanceTimersByTimeAsync(30_000);

            expect(h.attempted).toEqual(['webrtc']);
        });

        it('can be started again afterwards', async () => {
            const h = makeHarness(fullLadder);
            await h.ladder.start();
            await h.ladder.stop();

            await h.ladder.retry();

            expect(h.latest().phase).toBe('connecting');
            expect(h.attempted).toEqual(['webrtc', 'webrtc']);
        });
    });

    it('passes an abort signal to the client so an in-flight request can be cancelled', async () => {
        let received = null;
        const ladder = createLadder({
            rungs: fullLadder,
            createClient: () => ({
                async start(rung, { signal }) {
                    received = signal;
                },
                async stop() {},
            }),
            onState: () => {},
        });

        await ladder.start();

        expect(received).toBeInstanceOf(AbortSignal);
        expect(received.aborted).toBe(false);

        await ladder.stop();
        expect(received.aborted).toBe(true);
    });
});
