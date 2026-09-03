/**
 * One place that configures dayjs, so no view has to remember to import a locale or a
 * plugin. Import the helpers from here; never `import dayjs from 'dayjs'` in a component.
 *
 * The app is Dutch throughout (docs/v2/05-android-app.md), which means the `nl` locale --
 * without it dayjs formats "monday 1 september" and the day separators in the feed read
 * wrong.
 */
import dayjs from 'dayjs';
import 'dayjs/locale/nl';
import relativeTime from 'dayjs/plugin/relativeTime';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
import duration from 'dayjs/plugin/duration';

dayjs.extend(relativeTime);
dayjs.extend(isToday);
dayjs.extend(isYesterday);
dayjs.extend(duration);
dayjs.locale('nl');

export { dayjs };

/** `14:32` */
export function formatTime(value) {
    return dayjs(value).format('HH:mm');
}

/** `14:32:07` */
export function formatTimeSeconds(value) {
    return dayjs(value).format('HH:mm:ss');
}

/** `maandag 1 september` */
export function formatDayLong(value) {
    return dayjs(value).format('dddd D MMMM');
}

/**
 * The feed's day separators: today and yesterday get a word, everything else gets a date.
 * Capitalised because it is a heading, and dayjs' Dutch locale is lowercase.
 */
export function formatDayHeading(value) {
    const day = dayjs(value);
    if (day.isToday()) return 'Vandaag';
    if (day.isYesterday()) return 'Gisteren';
    const label = day.year() === dayjs().year()
        ? day.format('dddd D MMMM')
        : day.format('dddd D MMMM YYYY');
    return label.charAt(0).toUpperCase() + label.slice(1);
}

/** `3 uur geleden` -- used by the stale-feed banner. */
export function formatRelative(value) {
    return dayjs(value).fromNow();
}

/** Seconds as `mm:ss`, for player positions and clip durations. */
export function formatClock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** `4 s` / `1 m 12 s` -- event durations, which are short and want a unit. */
export function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    if (seconds < 60) return `${Math.round(seconds)} s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return rest === 0 ? `${minutes} m` : `${minutes} m ${rest} s`;
}

/** `YYYY-MM-DD` in local time, for the timeline and date filters. */
export function toDateKey(value) {
    return dayjs(value).format('YYYY-MM-DD');
}
