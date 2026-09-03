import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDayHeading, formatClock, formatDuration, toDateKey, formatDayLong } from './datetime.js';

describe('datetime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-03T14:32:00+02:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('names today and yesterday instead of dating them', () => {
        expect(formatDayHeading('2026-09-03T09:00:00+02:00')).toBe('Vandaag');
        expect(formatDayHeading('2026-09-02T23:59:00+02:00')).toBe('Gisteren');
    });

    it('writes older days in Dutch, capitalised, and adds the year only when it differs', () => {
        expect(formatDayHeading('2026-09-01T10:00:00+02:00')).toBe('Dinsdag 1 september');
        expect(formatDayHeading('2025-09-01T10:00:00+02:00')).toBe('Maandag 1 september 2025');
    });

    it('formats Dutch long days', () => {
        expect(formatDayLong('2026-09-01T10:00:00+02:00')).toBe('dinsdag 1 september');
    });

    it('formats player clocks', () => {
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(9)).toBe('0:09');
        expect(formatClock(75)).toBe('1:15');
        expect(formatClock(NaN)).toBe('0:00');
        expect(formatClock(-1)).toBe('0:00');
    });

    it('formats event durations with units', () => {
        expect(formatDuration(4)).toBe('4 s');
        expect(formatDuration(60)).toBe('1 m');
        expect(formatDuration(72)).toBe('1 m 12 s');
        expect(formatDuration(null)).toBeNull();
    });

    it('keys dates in local time', () => {
        expect(toDateKey('2026-09-03T14:32:00+02:00')).toBe('2026-09-03');
    });
});
