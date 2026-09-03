import { describe, it, expect } from 'vitest';
import {
    timeToX, xToTime, panCenter, zoomAround, snapWindow, ticks, tickIntervalMs,
    rangeAt, offsetInRange, previewFraction, clampWindow, clampCenter,
    HOUR_MS, DAY_MS, MINUTE_MS,
} from './useTimelineGeometry.js';

const view = { width: 360, windowMs: HOUR_MS, centerTs: Date.parse('2026-09-03T12:00:00Z') };

describe('timeline geometry', () => {
    describe('mapping', () => {
        it('puts the centre timestamp at the playhead', () => {
            expect(timeToX(view.centerTs, view)).toBe(180);
        });

        it('places earlier times left and later times right', () => {
            expect(timeToX(view.centerTs - 30 * MINUTE_MS, view)).toBe(0);
            expect(timeToX(view.centerTs + 30 * MINUTE_MS, view)).toBe(360);
        });

        it('round-trips through pixels', () => {
            const ts = view.centerTs + 7 * MINUTE_MS;
            expect(xToTime(timeToX(ts, view), view)).toBeCloseTo(ts, 5);
        });
    });

    describe('panning', () => {
        it('moves time the opposite way to the finger', () => {
            // Dragging right (positive dx) should reveal earlier time.
            expect(panCenter(view.centerTs, 180, view)).toBe(view.centerTs - HOUR_MS / 2);
        });

        it('keeps the day reachable at both ends', () => {
            const dayStart = Date.parse('2026-09-03T00:00:00Z');
            const dayEnd = dayStart + DAY_MS;

            expect(clampCenter(dayStart - DAY_MS, { dayStart, dayEnd, windowMs: HOUR_MS }))
                .toBe(dayStart - HOUR_MS / 2);
            expect(clampCenter(dayEnd + DAY_MS, { dayStart, dayEnd, windowMs: HOUR_MS }))
                .toBe(dayEnd + HOUR_MS / 2);
        });
    });

    describe('pinch zoom', () => {
        it('keeps the timestamp under the fingers exactly where it was', () => {
            const midX = 90;
            const anchorBefore = xToTime(midX, view);

            const next = zoomAround(midX, 2, view);
            const anchorAfter = xToTime(midX, { ...view, ...next });

            expect(anchorAfter).toBeCloseTo(anchorBefore, 5);
        });

        it('holds the anchor when zooming out too', () => {
            const midX = 300;
            const anchorBefore = xToTime(midX, view);

            const next = zoomAround(midX, 0.5, view);

            expect(xToTime(midX, { ...view, ...next })).toBeCloseTo(anchorBefore, 5);
        });

        it('narrows the window when scaling up', () => {
            expect(zoomAround(180, 2, view).windowMs).toBe(HOUR_MS / 2);
        });

        it('refuses to zoom past a minute or past a day', () => {
            expect(clampWindow(1000)).toBe(MINUTE_MS);
            expect(clampWindow(10 * DAY_MS)).toBe(DAY_MS);
            expect(zoomAround(180, 1000, view).windowMs).toBe(MINUTE_MS);
        });
    });

    describe('snapping', () => {
        it('settles on the nearest level when the fingers lift', () => {
            expect(snapWindow(HOUR_MS * 1.1)).toBe(HOUR_MS);
            expect(snapWindow(DAY_MS * 0.9)).toBe(DAY_MS);
            expect(snapWindow(MINUTE_MS * 1.2)).toBe(MINUTE_MS);
        });
    });

    describe('ticks', () => {
        it('thins out as the window widens, and always picks a readable interval', () => {
            expect(tickIntervalMs(DAY_MS)).toBe(3 * HOUR_MS);
            expect(tickIntervalMs(HOUR_MS)).toBe(10 * MINUTE_MS);
            expect(tickIntervalMs(10 * MINUTE_MS)).toBe(2 * MINUTE_MS);
            expect(tickIntervalMs(MINUTE_MS)).toBe(10_000);
        });

        it('aligns to local midnight, not to the epoch', () => {
            // A 3-hour tick aligned to the epoch lands on 03:00 UTC, which is 05:00 here in
            // summer -- a round number in the wrong timezone.
            const dayStart = Date.parse('2026-09-03T00:00:00+02:00');
            const result = ticks({ width: 360, windowMs: DAY_MS, centerTs: dayStart + DAY_MS / 2, dayStart });

            for (const ts of result) {
                expect((ts - dayStart) % (3 * HOUR_MS)).toBe(0);
            }
        });

        it('keeps between two and nine labels on screen at every zoom', () => {
            for (const windowMs of [MINUTE_MS, 15 * MINUTE_MS, HOUR_MS, 6 * HOUR_MS, DAY_MS]) {
                const count = ticks({ width: 360, windowMs, centerTs: view.centerTs }).length;
                expect(count).toBeGreaterThanOrEqual(2);
                expect(count).toBeLessThanOrEqual(9);
            }
        });
    });

    describe('recordings', () => {
        const ranges = [
            { start: '2026-09-03T00:00:00Z', end: '2026-09-03T03:00:00Z', vod_url: 'a' },
            { start: '2026-09-03T03:20:00Z', end: '2026-09-03T12:00:00Z', vod_url: 'b' },
        ];

        it('finds the range under a timestamp', () => {
            expect(rangeAt(Date.parse('2026-09-03T01:00:00Z'), ranges).vod_url).toBe('a');
            expect(rangeAt(Date.parse('2026-09-03T04:00:00Z'), ranges).vod_url).toBe('b');
        });

        it('returns nothing inside a gap, so the UI can say there is no recording', () => {
            expect(rangeAt(Date.parse('2026-09-03T03:10:00Z'), ranges)).toBeNull();
        });

        it('treats the end of a range as outside it, so adjacent ranges never both match', () => {
            expect(rangeAt(Date.parse('2026-09-03T03:00:00Z'), ranges)).toBeNull();
        });

        it('converts a timestamp to an offset into the recording', () => {
            expect(offsetInRange(Date.parse('2026-09-03T00:02:30Z'), ranges[0])).toBe(150);
        });

        it('never returns a negative offset', () => {
            expect(offsetInRange(Date.parse('2026-09-02T23:00:00Z'), ranges[0])).toBe(0);
        });
    });

    describe('previews', () => {
        const preview = { start: '2026-09-03T14:00:00Z', end: '2026-09-03T15:00:00Z' };

        it('seeks proportionally, since a preview file has no index', () => {
            expect(previewFraction(Date.parse('2026-09-03T14:30:00Z'), preview)).toBe(0.5);
            expect(previewFraction(Date.parse('2026-09-03T14:00:00Z'), preview)).toBe(0);
        });

        it('clamps outside its own hour', () => {
            expect(previewFraction(Date.parse('2026-09-03T16:00:00Z'), preview)).toBe(1);
            expect(previewFraction(Date.parse('2026-09-03T13:00:00Z'), preview)).toBe(0);
        });

        it('does not divide by zero on a degenerate preview', () => {
            expect(previewFraction(Date.now(), { start: 'x', end: 'y' })).toBe(0);
        });
    });
});
