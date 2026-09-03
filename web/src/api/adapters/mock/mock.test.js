import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockAdapter } from './index.js';
import { resetDb, getDb } from './db.js';
import { setMockSettings, resetMockSettings } from './settings.js';
import { NetworkError } from '@/api/errors.js';

const api = createMockAdapter();

describe('mock adapter', () => {
    beforeEach(() => {
        resetDb();
        resetMockSettings();
        setMockSettings({ latencyMs: 0, jitterMs: 0 });
    });

    // Belt and braces: a test that leaves fake timers installed would otherwise hang every
    // test after it, since the mock's latency is a real setTimeout.
    afterEach(() => vi.useRealTimers());

    describe('the generated world', () => {
        it('produces a week of events, newest first', async () => {
            const page = await api.events.list({ limit: 100 });
            expect(page.events.length).toBeGreaterThan(40);

            const timestamps = page.events.map((e) => Date.parse(e.started_at));
            expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
        });

        it('is deterministic across rebuilds, so a bug can be looked at twice', async () => {
            const first = (await api.events.list({ limit: 10 })).events.map((e) => e.id);
            resetDb();
            const second = (await api.events.list({ limit: 10 })).events.map((e) => e.id);
            expect(second).toEqual(first);
        });

        it('only calls it an alert when a person or car reached the path', async () => {
            const { events } = await api.events.list({ limit: 200 });
            for (const event of events.filter((e) => e.severity === 'alert')) {
                expect(event.zones).toContain('pad');
                expect(['person', 'car']).toContain(event.label);
            }
        });

        it('leaves only a handful unread', async () => {
            expect(await api.events.unreadCount()).toBe(5);
        });

        it('tags night-time path activity, which is what the notification rules key on', async () => {
            const { events } = await api.events.list({ limit: 200 });
            const nightTagged = events.filter((e) => e.derived_tags.includes('nacht'));
            expect(nightTagged.length).toBeGreaterThan(0);
            for (const event of nightTagged) {
                const hour = new Date(event.started_at).getHours();
                expect(hour >= 23 || hour < 6).toBe(true);
            }
        });

        it('never dates an event in the future', async () => {
            const { events } = await api.events.list({ limit: 200 });
            for (const event of events) {
                expect(Date.parse(event.started_at)).toBeLessThanOrEqual(Date.now());
            }
        });
    });

    describe('pagination', () => {
        it('walks the whole feed without repeating or skipping', async () => {
            const seen = [];
            let cursor = null;
            let pages = 0;

            do {
                const page = await api.events.list({ cursor, limit: 7 });
                seen.push(...page.events.map((e) => e.id));
                cursor = page.next_cursor;
                pages += 1;
            } while (cursor && pages < 100);

            expect(cursor).toBeNull();
            expect(new Set(seen).size).toBe(seen.length);

            const all = (await api.events.list({ limit: 500 })).events.map((e) => e.id);
            expect(seen).toEqual(all);
        });

        it('stops offering a cursor on the last page', async () => {
            const page = await api.events.list({ limit: 500 });
            expect(page.next_cursor).toBeNull();
        });

        it('paginates filtered results correctly -- the zone-filter truncation bug', async () => {
            // The API had exactly this defect: the zone filter ran in PHP after SQL's LIMIT,
            // so a filtered feed stopped early. Walking the pages must equal filtering the
            // whole set.
            const walked = [];
            let cursor = null;
            do {
                const page = await api.events.list({ cursor, limit: 5, zones: ['pad'] });
                walked.push(...page.events.map((e) => e.id));
                cursor = page.next_cursor;
            } while (cursor);

            const direct = (await api.events.list({ limit: 500, zones: ['pad'] })).events.map((e) => e.id);
            expect(walked).toEqual(direct);
            expect(walked.length).toBeGreaterThan(5);
        });

        it('ignores a tampered cursor instead of failing', async () => {
            const page = await api.events.list({ cursor: 'garbage', limit: 3 });
            expect(page.events).toHaveLength(3);
        });
    });

    describe('filters', () => {
        it('filters by severity', async () => {
            const { events } = await api.events.list({ limit: 200, severity: 'alert' });
            expect(events.length).toBeGreaterThan(0);
            expect(events.every((e) => e.severity === 'alert')).toBe(true);
        });

        it('filters by camera and label', async () => {
            const { events } = await api.events.list({ limit: 200, cameras: ['achtertuin'], labels: ['person'] });
            expect(events.every((e) => e.camera === 'achtertuin' && e.label === 'person')).toBe(true);
        });

        it('matches any of the requested zones', async () => {
            const { events } = await api.events.list({ limit: 200, zones: ['straat'] });
            expect(events.every((e) => e.zones.includes('straat'))).toBe(true);
        });

        it('honours a date range', async () => {
            const from = new Date(Date.now() - 2 * 86_400_000).toISOString();
            const { events } = await api.events.list({ limit: 200, from });
            expect(events.every((e) => Date.parse(e.started_at) >= Date.parse(from))).toBe(true);
            expect(events.length).toBeGreaterThan(0);
        });

        it('searches descriptions, which is what the search box is for', async () => {
            const { events } = await api.events.list({ limit: 200, q: 'pakket' });
            expect(events.length).toBeGreaterThan(0);
            expect(events.every((e) => `${e.title} ${e.description}`.toLowerCase().includes('pakket'))).toBe(true);
        });
    });

    describe('media', () => {
        it('gives every event a thumbnail, a snapshot and an expiry', async () => {
            const [event] = (await api.events.list({ limit: 1 })).events;
            expect(event.media.thumbnail).toMatch(/^data:image\/svg\+xml/);
            expect(event.media.snapshot).toMatch(/^data:image\/svg\+xml/);
            expect(event.media.clip).toBe('/mock/sample-clip.mp4');
            expect(Date.parse(event.media.expires_at)).toBeGreaterThan(Date.now());
        });

        it('honours a short TTL, so expiry is reviewable on purpose', async () => {
            setMockSettings({ mediaTtlSeconds: 5 });
            const [event] = (await api.events.list({ limit: 1 })).events;
            expect(Date.parse(event.media.expires_at) - Date.now()).toBeLessThanOrEqual(5000);
        });

        it('re-signs on refresh', async () => {
            setMockSettings({ mediaTtlSeconds: 60 });
            const [event] = (await api.events.list({ limit: 1 })).events;

            // Only Date is faked: the mock's own setTimeout-based latency has to keep
            // running, or the awaited call never resolves.
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(Date.now() + 30_000);

            const media = await api.media.refresh(event.id);

            expect(Date.parse(media.expires_at)).toBeGreaterThan(Date.parse(event.media.expires_at));
        });
    });

    describe('simulated network', () => {
        it('throws a NetworkError when offline', async () => {
            setMockSettings({ offline: true });
            await expect(api.events.list()).rejects.toBeInstanceOf(NetworkError);
        });

        it('still answers the unread count offline check as a failure, not a hang', async () => {
            setMockSettings({ offline: true });
            await expect(api.events.unreadCount()).rejects.toBeInstanceOf(NetworkError);
        });

        it('fails at the configured rate', async () => {
            setMockSettings({ failureRate: 1 });
            await expect(api.events.list()).rejects.toBeInstanceOf(NetworkError);
        });
    });

    describe('mutations', () => {
        it('marks an event seen and lowers the unread count', async () => {
            const before = await api.events.unreadCount();
            const unseen = getDb().events.find((e) => !e.seen);
            await api.events.markSeen(unseen.id);
            expect(await api.events.unreadCount()).toBe(before - 1);
        });

        it('stores feedback', async () => {
            const [event] = (await api.events.list({ limit: 1 })).events;
            await api.events.feedback(event.id, 'fietser');
            expect(getDb().events.find((e) => e.id === event.id).feedback).toBe('fietser');
        });

        it('round-trips zones', async () => {
            const zones = [{ name: 'test', color: '#fff', objects: ['person'], points: [{ x: 0, y: 0 }] }];
            await api.zones.put('voordeur', zones);
            expect(await api.zones.get('voordeur')).toEqual(zones);
        });

        it('ships the day-one notification rules', async () => {
            const rules = await api.notifications.getRules();
            expect(rules[0].action).toBe('silent');
            expect(rules[0].sub_labels).toEqual(['bewoner']);
        });
    });

    describe('live source', () => {
        it('offers the full ladder plus a playable demo rung', async () => {
            const source = await api.live.getSource('voordeur');
            expect(source.rungs.map((r) => r.type)).toEqual(['webrtc', 'mse', 'hls', 'file', 'snapshot']);
            expect(source.rungs.every((r) => r.url)).toBe(true);
        });

        it('lets rungs be failed on demand so the descent can be watched', async () => {
            setMockSettings({ failRungs: ['webrtc', 'mse'] });
            const source = await api.live.getSource('voordeur');
            expect(source.rungs.find((r) => r.type === 'webrtc').url).toBeNull();
            expect(source.rungs.find((r) => r.type === 'mse').url).toBeNull();
            expect(source.rungs.find((r) => r.type === 'hls').url).toBeTruthy();
        });
    });

    describe('timeline', () => {
        it('describes the day with a deliberate recording gap', async () => {
            const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
            const day = await api.timeline.getDay('voordeur', date);

            expect(day.recordings.length).toBe(2);
            expect(Date.parse(day.recordings[1].start)).toBeGreaterThan(Date.parse(day.recordings[0].end));
            expect(day.previews.length).toBe(24);
            expect(day.events.every((e) => e.start.startsWith(date))).toBe(true);
        });

        it('orders markers forward in time, the way the strip draws them', async () => {
            const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
            const day = await api.timeline.getDay('voordeur', date);
            const starts = day.events.map((e) => Date.parse(e.start));
            expect([...starts].sort((a, b) => a - b)).toEqual(starts);
        });
    });
});
