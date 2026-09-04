/**
 * The live fallback ladder, as a state machine.
 *
 * docs/v2/02-video-transport.md: attempt WebRTC, fall to the next rung if no video frame has
 * arrived after ~3 seconds, and never choose up front -- a network that looks fine can still
 * have UDP blocked, and the only reliable test is trying.
 *
 * Deliberately free of the DOM. Clients arrive through `createClient`, timers are plain
 * setTimeout, and the only output is `onState`. That is what lets the whole descent be
 * tested under fake timers with no camera, no network and no video element.
 */

const DEFAULTS = {
    firstFrameTimeoutMs: 3000,
    stallTimeoutMs: 5000,
    backoffMs: [1000, 2000, 4000],
    maxAttemptsPerRung: 3,
    retryFromTopMs: 10_000,
};

export function createLadder(options) {
    const config = { ...DEFAULTS, ...options };
    const { rungs, createClient, onState } = config;

    let phase = 'idle';
    let rungIndex = -1;
    let attempt = 0;
    let client = null;
    let controller = null;
    let timer = null;
    let error = null;
    let stopped = false;
    /** Guards against a client that emits after it was told to stop. */
    let generation = 0;

    function state() {
        return {
            phase,
            rungIndex,
            rung: rungIndex >= 0 ? rungs[rungIndex] : null,
            attempt,
            error,
        };
    }

    function emit() {
        onState?.(state());
    }

    function clearTimer() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    }

    async function teardown() {
        clearTimer();
        generation += 1;
        controller?.abort();
        controller = null;

        const current = client;
        client = null;
        if (current) {
            try {
                await current.stop();
            } catch {
                // A client that fails while being torn down has nothing left to break.
            }
        }
    }

    /**
     * Snapshot polling never descends: there is nothing below it, and a still picture that
     * keeps retrying beats a blank screen with an error on it.
     */
    function isTerminalRung(index) {
        return rungs[index]?.type === 'snapshot';
    }

    async function connect(index, nextAttempt = 1) {
        await teardown();
        if (stopped) return;

        if (index >= rungs.length) {
            phase = 'exhausted';
            rungIndex = -1;
            emit();
            // Conditions change: a phone that walks back into wifi should recover on its
            // own rather than waiting for someone to press something.
            timer = setTimeout(() => connect(0), config.retryFromTopMs);
            return;
        }

        const rung = rungs[index];

        // A rung with no URL cannot be attempted. The mock uses exactly this to make the
        // descent reviewable on demand.
        if (!rung?.url) {
            return connect(index + 1);
        }

        rungIndex = index;
        attempt = nextAttempt;
        phase = 'connecting';
        error = null;
        emit();

        const myGeneration = generation;
        controller = new AbortController();

        const emitFromClient = (event, payload) => {
            // Ignore anything from a client we have already moved on from.
            if (myGeneration !== generation || stopped) return;
            handleClientEvent(event, payload);
        };

        client = createClient(rung.type, emitFromClient);

        // No first frame within the timeout means this rung is not going to work, whatever
        // the transport thinks. Latency is the whole point; a slow success is a failure.
        clearTimer();
        timer = setTimeout(() => {
            if (myGeneration === generation) failCurrentRung(new Error('Geen beeld binnen de tijd'));
        }, config.firstFrameTimeoutMs);

        try {
            await client.start(rung, { signal: controller.signal });
        } catch (startError) {
            if (myGeneration === generation) failCurrentRung(startError);
        }
    }

    function handleClientEvent(event, payload) {
        if (event === 'firstFrame') {
            clearTimer();
            phase = 'playing';
            error = null;
            emit();
            return;
        }

        if (event === 'stalled') {
            if (phase !== 'playing') return;
            phase = 'stalled';
            emit();
            clearTimer();
            timer = setTimeout(() => failCurrentRung(new Error('Verbinding viel stil')), config.stallTimeoutMs);
            return;
        }

        // A stall that fixes itself is a hiccup, not a broken rung. Without this the timer
        // set above runs to completion and drops a working stream down a rung for a pause
        // the viewer may not even have noticed.
        if (event === 'resumed') {
            if (phase !== 'stalled') return;
            clearTimer();
            phase = 'playing';
            error = null;
            emit();
            return;
        }

        if (event === 'error') {
            failCurrentRung(payload ?? new Error('Onbekende fout'));
        }
    }

    function failCurrentRung(reason) {
        if (stopped) return;

        clearTimer();
        error = reason;

        const index = rungIndex;
        const canRetry = attempt < config.maxAttemptsPerRung;

        if (canRetry && isTerminalRung(index)) {
            // Retry the bottom rung forever, at its slowest backoff.
            return scheduleRetry(index, attempt + 1);
        }

        if (canRetry && phase === 'playing') {
            // It worked a moment ago, so the rung itself is viable -- a blip deserves a
            // retry before dropping the quality for everyone watching.
            return scheduleRetry(index, attempt + 1);
        }

        if (isTerminalRung(index)) {
            return scheduleRetry(index, 1);
        }

        connect(index + 1);
    }

    function scheduleRetry(index, nextAttempt) {
        phase = 'connecting';
        emit();
        const delay = config.backoffMs[Math.min(nextAttempt - 2, config.backoffMs.length - 1)] ?? 1000;
        clearTimer();
        timer = setTimeout(() => connect(index, nextAttempt), delay);
    }

    return {
        start() {
            stopped = false;
            return connect(0);
        },

        async stop() {
            stopped = true;
            await teardown();
            phase = 'stopped';
            rungIndex = -1;
            emit();
        },

        retry() {
            stopped = false;
            return connect(0);
        },

        get state() {
            return state();
        },
    };
}
