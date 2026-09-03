/**
 * The maths behind the scrubber. Pure functions, no DOM, so the fiddly parts -- pinch
 * keeping the timestamp under your fingers fixed, ticks that stay readable at every zoom --
 * are testable rather than eyeballed.
 *
 * The playhead sits at the centre of the strip and time moves under it, which is how a Ring
 * timeline behaves: you drag the day past a fixed "now you are here" marker.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** The window widths the pinch snaps to when you let go. */
export const ZOOM_LEVELS = [MINUTE_MS, 15 * MINUTE_MS, HOUR_MS, 6 * HOUR_MS, DAY_MS];

export const MIN_WINDOW_MS = MINUTE_MS;
export const MAX_WINDOW_MS = DAY_MS;

export function pxPerMs(width, windowMs) {
    return width / windowMs;
}

/** Where a timestamp lands, in pixels from the strip's left edge. */
export function timeToX(ts, { width, windowMs, centerTs }) {
    return width / 2 + (ts - centerTs) * pxPerMs(width, windowMs);
}

/** Which timestamp is under a given pixel. */
export function xToTime(x, { width, windowMs, centerTs }) {
    return centerTs + (x - width / 2) / pxPerMs(width, windowMs);
}

/** Dragging by `dx` pixels moves time the other way: the strip slides under the playhead. */
export function panCenter(centerTs, dx, { width, windowMs }) {
    return centerTs - dx / pxPerMs(width, windowMs);
}

export function clampCenter(centerTs, { dayStart, dayEnd, windowMs }) {
    // Half a window of slack at each end, so the first and last moments of the day can still
    // be brought under the centre playhead.
    const half = windowMs / 2;
    return Math.min(Math.max(centerTs, dayStart - half), dayEnd + half);
}

export function clampWindow(windowMs) {
    return Math.min(Math.max(windowMs, MIN_WINDOW_MS), MAX_WINDOW_MS);
}

/**
 * Pinch. The timestamp under the midpoint of the two fingers must not move -- that is the
 * whole feel of a zoom, and getting it wrong makes the strip squirm away from you.
 */
export function zoomAround(midX, scale, { width, windowMs, centerTs }) {
    const anchorTs = xToTime(midX, { width, windowMs, centerTs });
    const nextWindow = clampWindow(windowMs / scale);
    const nextCenter = anchorTs - (midX - width / 2) / pxPerMs(width, nextWindow);
    return { windowMs: nextWindow, centerTs: nextCenter };
}

export function snapWindow(windowMs) {
    return ZOOM_LEVELS.reduce((best, level) =>
        Math.abs(Math.log(level / windowMs)) < Math.abs(Math.log(best / windowMs)) ? level : best,
    );
}

/**
 * Intervals a person reads without thinking. Ten past two is a time; 07:23 is a number.
 */
const NICE_INTERVALS = [
    10_000, 30_000,
    MINUTE_MS, 2 * MINUTE_MS, 5 * MINUTE_MS, 10 * MINUTE_MS, 15 * MINUTE_MS, 30 * MINUTE_MS,
    HOUR_MS, 2 * HOUR_MS, 3 * HOUR_MS, 6 * HOUR_MS,
];

const MAX_TICKS = 8;

/**
 * Tick spacing, from one rule rather than a table of thresholds: the smallest readable
 * interval that fits at most MAX_TICKS labels. A fixed interval either crowds the strip at
 * day scale or empties it at minute scale, and hand-tuned breakpoints drift out of step with
 * the zoom levels they are supposed to match.
 */
export function tickIntervalMs(windowMs) {
    return NICE_INTERVALS.find((interval) => windowMs / interval <= MAX_TICKS)
        ?? NICE_INTERVALS[NICE_INTERVALS.length - 1];
}

/**
 * The tick timestamps in the current window.
 *
 * Aligned to `dayStart` -- local midnight -- rather than to the epoch. Aligning to the epoch
 * would put a 4-hour tick on 04:00 UTC, which is 06:00 here in summer and 05:00 in winter:
 * round numbers in the wrong timezone.
 */
export function ticks({ width, windowMs, centerTs, dayStart = 0 }) {
    const interval = tickIntervalMs(windowMs);
    const from = centerTs - windowMs / 2;
    const to = centerTs + windowMs / 2;

    const first = dayStart + Math.ceil((from - dayStart) / interval) * interval;
    const result = [];
    for (let ts = first; ts <= to; ts += interval) {
        result.push(ts);
    }
    return result;
}

/** The recording range covering a timestamp, or null when it falls in a gap. */
export function rangeAt(ts, ranges) {
    return (
        ranges.find((range) => {
            const start = Date.parse(range.start);
            const end = Date.parse(range.end);
            return ts >= start && ts < end;
        }) ?? null
    );
}

/** How far into a recording a timestamp is, in seconds. */
export function offsetInRange(ts, range) {
    return Math.max(0, (ts - Date.parse(range.start)) / 1000);
}

/** Seeking inside an hourly preview file is proportional: previews have no index. */
export function previewFraction(ts, preview) {
    const start = Date.parse(preview.start);
    const end = Date.parse(preview.end);
    if (!(end > start)) return 0;
    return Math.min(1, Math.max(0, (ts - start) / (end - start)));
}
