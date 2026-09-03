import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { createPreferencesMock } from '@/test/preferencesMock.js';

const preferences = createPreferencesMock();

vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({ BiometricAuth: { checkBiometry: vi.fn(), authenticate: vi.fn() } }));

const { useAuthStore } = await import('@/stores/authentication.js');

describe('auth store', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        preferences.store.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
    });
    afterEach(() => vi.useRealTimers());

    describe('token expiry', () => {
        it('takes the expiry from the JWT rather than assuming 60 minutes', async () => {
            const store = useAuthStore();
            const exp = Math.floor(Date.now() / 1000) + 900; // 15 minutes
            const token = makeJwt({ exp });

            await store.saveAuthToken(token, 'refresh-token');

            expect(store.authTokenExpiry).toBe(exp * 1000);
        });

        it('falls back to the given minutes when the token carries no exp', async () => {
            const store = useAuthStore();
            await store.saveAuthToken('opaque-token', 'refresh-token', 30);
            expect(store.authTokenExpiry).toBe(Date.now() + 30 * 60 * 1000);
        });

        it('moves the expiry forward on refresh -- the bug that logged people out after an hour', async () => {
            const store = useAuthStore();
            await store.saveAuthToken(makeJwt({ exp: Math.floor(Date.now() / 1000) + 60 }), 'refresh-token');
            const original = store.authTokenExpiry;

            vi.advanceTimersByTime(59_000);
            await store.updateAccessToken(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));

            expect(store.authTokenExpiry).toBeGreaterThan(original);
            expect(await store.isTokenValid()).toBe(true);
        });

        it('keeps the refresh token when the access token is refreshed', async () => {
            const store = useAuthStore();
            await store.saveAuthToken('token', 'refresh-token');
            await store.updateAccessToken('new-token');
            expect(preferences.store.get('refreshToken')).toBe('refresh-token');
        });
    });

    describe('clearAuthData', () => {
        it('keeps the refresh token by default, so a re-lock can still refresh', async () => {
            const store = useAuthStore();
            await store.saveAuthToken('token', 'refresh-token');
            await store.clearAuthData();
            expect(preferences.store.get('refreshToken')).toBe('refresh-token');
            expect(preferences.store.has('authToken')).toBe(false);
        });

        it('drops it when the session is genuinely over', async () => {
            const store = useAuthStore();
            await store.saveAuthToken('token', 'refresh-token');
            await store.clearAuthData({ forgetRefreshToken: true });
            expect(preferences.store.has('refreshToken')).toBe(false);
        });
    });

    describe('re-locking after time in the background', () => {
        it('does not re-lock inside the window', async () => {
            const store = useAuthStore();
            await store.setBiometricVerified(true);
            await store.markBackgrounded();

            vi.advanceTimersByTime(4 * 60 * 1000);

            expect(await store.relockIfExpired()).toBe(false);
            expect(await store.isBiometricVerified()).toBe(true);
        });

        it('re-locks past it, and only drops the biometric flag', async () => {
            const store = useAuthStore();
            await store.setAppActive();
            await store.setBiometricVerified(true);
            await store.markBackgrounded();

            vi.advanceTimersByTime(6 * 60 * 1000);

            expect(await store.relockIfExpired()).toBe(true);
            expect(await store.isBiometricVerified()).toBe(false);
            // A re-lock is not a cold start: the app is still "active", so the user gets the
            // fingerprint prompt rather than the password form.
            expect(await store.isAppActive()).toBe(true);
        });

        it('honours a configured delay', async () => {
            const store = useAuthStore();
            await store.setBiometricVerified(true);
            await store.setRelockMinutes(30);
            await store.markBackgrounded();

            vi.advanceTimersByTime(10 * 60 * 1000);
            expect(await store.relockIfExpired()).toBe(false);

            vi.advanceTimersByTime(21 * 60 * 1000);
            expect(await store.relockIfExpired()).toBe(true);
        });

        it('does nothing when the session was not unlocked in the first place', async () => {
            const store = useAuthStore();
            await store.setBiometricVerified(false);
            expect(await store.relockIfExpired()).toBe(false);
        });

        it('starts the clock instead of locking when no timestamp exists yet', async () => {
            const store = useAuthStore();
            await store.setBiometricVerified(true);

            expect(await store.relockIfExpired()).toBe(false);
            expect(preferences.store.has('lastActiveTime')).toBe(true);
        });
    });

    describe('pending route', () => {
        it('remembers a route once and hands it over exactly once', () => {
            const store = useAuthStore();
            store.stashPendingRoute('/events/abc');
            expect(store.takePendingRoute()).toBe('/events/abc');
            expect(store.takePendingRoute()).toBeNull();
        });

        it('ignores the login route itself', () => {
            const store = useAuthStore();
            store.stashPendingRoute('/');
            expect(store.takePendingRoute()).toBeNull();
        });
    });
});

function makeJwt(payload) {
    const encode = (obj) =>
        btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${encode({ alg: 'HS256' })}.${encode(payload)}.sig`;
}
