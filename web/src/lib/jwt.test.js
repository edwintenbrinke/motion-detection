import { describe, it, expect } from 'vitest';
import { decodeJwtExpiry } from './jwt.js';

function makeToken(payload) {
    const encode = (obj) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${encode({ alg: 'HS256' })}.${encode(payload)}.signature`;
}

describe('decodeJwtExpiry', () => {
    it('reads exp and converts seconds to milliseconds', () => {
        expect(decodeJwtExpiry(makeToken({ exp: 1756800000 }))).toBe(1756800000000);
    });

    it('survives base64url padding', () => {
        // A payload whose base64 needs one and two '=' of padding respectively.
        expect(decodeJwtExpiry(makeToken({ exp: 1756800000, u: 'ab' }))).toBe(1756800000000);
        expect(decodeJwtExpiry(makeToken({ exp: 1756800000, u: 'abc' }))).toBe(1756800000000);
    });

    it('handles non-ASCII payloads', () => {
        expect(decodeJwtExpiry(makeToken({ exp: 1756800000, name: 'Edwin ten Brinke' }))).toBe(1756800000000);
    });

    it('returns null rather than throwing on anything unexpected', () => {
        expect(decodeJwtExpiry(null)).toBeNull();
        expect(decodeJwtExpiry('')).toBeNull();
        expect(decodeJwtExpiry('not.a.jwt')).toBeNull();
        expect(decodeJwtExpiry('onlyonepart')).toBeNull();
        expect(decodeJwtExpiry(makeToken({ sub: 'no exp claim' }))).toBeNull();
        expect(decodeJwtExpiry(makeToken({ exp: 'soon' }))).toBeNull();
    });
});
