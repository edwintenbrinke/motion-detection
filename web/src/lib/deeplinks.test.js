import { describe, it, expect } from 'vitest';
import { parseDeepLink, routeFromNotification } from './deeplinks.js';

describe('parseDeepLink', () => {
    it('reads the custom scheme', () => {
        expect(parseDeepLink('motiondetection://event/1738d2c1')).toBe('/events/1738d2c1');
    });

    it('reads the App Link', () => {
        expect(parseDeepLink('https://motion.edwintenbrinke.nl/event/abc-123')).toBe('/events/abc-123');
    });

    it('reads a bare path, which is what an FCM payload often carries', () => {
        expect(parseDeepLink('/event/abc-123')).toBe('/events/abc-123');
    });

    it('accepts the in-app plural form too', () => {
        expect(parseDeepLink('https://motion.edwintenbrinke.nl/events/abc')).toBe('/events/abc');
    });

    it('refuses a link to somebody else', () => {
        // A link that could navigate the app anywhere would make any web page a remote
        // control for it.
        expect(parseDeepLink('https://example.com/event/abc')).toBeNull();
        expect(parseDeepLink('https://motion.edwintenbrinke.nl.evil.com/event/abc')).toBeNull();
    });

    it('refuses paths that are not an event', () => {
        expect(parseDeepLink('motiondetection://settings/zones')).toBeNull();
        expect(parseDeepLink('https://motion.edwintenbrinke.nl/')).toBeNull();
        expect(parseDeepLink('/event/')).toBeNull();
    });

    it('handles ids that need escaping without losing them', () => {
        expect(parseDeepLink('motiondetection://event/a%2Fb')).toBe('/events/a%2Fb');
    });

    it('ignores query strings and fragments after the id', () => {
        expect(parseDeepLink('https://motion.edwintenbrinke.nl/event/abc?utm=x')).toBe('/events/abc');
        expect(parseDeepLink('motiondetection://event/abc#top')).toBe('/events/abc');
    });

    it('returns null rather than throwing on nonsense', () => {
        expect(parseDeepLink(null)).toBeNull();
        expect(parseDeepLink('')).toBeNull();
        expect(parseDeepLink('   ')).toBeNull();
        expect(parseDeepLink('not a url')).toBeNull();
        expect(parseDeepLink('https://')).toBeNull();
    });
});

describe('routeFromNotification', () => {
    it('prefers the explicit event id', () => {
        expect(routeFromNotification({ event_id: 'abc', url: 'https://motion.edwintenbrinke.nl/event/other' }))
            .toBe('/events/abc');
    });

    it('falls back to the url', () => {
        expect(routeFromNotification({ url: 'motiondetection://event/xyz' })).toBe('/events/xyz');
    });

    it('returns null for a payload with neither', () => {
        expect(routeFromNotification({})).toBeNull();
        expect(routeFromNotification(null)).toBeNull();
        expect(routeFromNotification({ url: 'https://example.com/event/abc' })).toBeNull();
    });
});
