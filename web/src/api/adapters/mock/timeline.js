/**
 * A day of recordings, previews and markers for the scrubber.
 *
 * The gap matters: continuous recording is not actually continuous (a pod restart, a
 * network blip), and a scrubber that assumes it is will happily seek into nothing. One
 * deliberate 20-minute hole makes the "Geen opname" path reachable in the mock.
 */
export function buildTimelineDay(camera, date, allEvents, sampleClip) {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayStartMs = dayStart.getTime();
    const now = Date.now();
    const dayEndMs = Math.min(dayStartMs + 86_400_000, now);

    const gapStart = dayStartMs + 3 * 3_600_000 + 10 * 60_000;
    const gapEnd = gapStart + 20 * 60_000;

    const recordings = [];
    const pushRange = (start, end) => {
        if (end > start) {
            recordings.push({
                start: new Date(start).toISOString(),
                end: new Date(end).toISOString(),
                vod_url: sampleClip,
            });
        }
    };

    if (dayEndMs <= gapStart) {
        pushRange(dayStartMs, dayEndMs);
    } else {
        pushRange(dayStartMs, gapStart);
        pushRange(Math.min(gapEnd, dayEndMs), dayEndMs);
    }

    // Frigate writes one low-fps preview file per hour per camera; that is what the drag
    // scrubs through, which is why a day of scrubbing is megabytes and not gigabytes.
    const previews = [];
    for (let hour = 0; hour < 24; hour += 1) {
        const start = dayStartMs + hour * 3_600_000;
        if (start >= dayEndMs) break;
        previews.push({
            start: new Date(start).toISOString(),
            end: new Date(Math.min(start + 3_600_000, dayEndMs)).toISOString(),
            preview_url: sampleClip,
        });
    }

    const events = allEvents
        .filter((event) => {
            if (event.camera !== camera) return false;
            const started = Date.parse(event.started_at);
            return started >= dayStartMs && started < dayStartMs + 86_400_000;
        })
        .map((event) => ({
            id: event.id,
            start: event.started_at,
            end: event.ended_at,
            label: event.label,
            severity: event.severity,
        }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

    return {
        camera,
        date,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        recordings,
        previews,
        events,
    };
}
