import { defineStore } from 'pinia';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';
import { decodeJwtExpiry } from '@/lib/jwt.js';
import { DEFAULT_RELOCK_MINUTES } from '@/lib/env.js';

const APP_STATE_KEYS = {
    IS_APP_ACTIVE: 'isAppActive',
    LAST_ACTIVE_TIME: 'lastActiveTime',
    BIOMETRIC_VERIFIED: 'biometricVerified',
    RELOCK_MINUTES: 'relockMinutes',
};

const FALLBACK_TOKEN_MINUTES = 60;

export const useAuthStore = defineStore('auth', {
    state: () => ({
        authToken: null,
        authTokenExpiry: null,
        hasLoggedInWithCredentials: false,
        /**
         * Where to go once the session gate is satisfied again. Set by a re-lock (so the
         * user lands back where they were) and by a deep link that arrived while locked.
         * In memory only -- it is a navigation intent, not session state.
         */
        pendingRoute: null,
    }),

    actions: {
        async authenticateWithBiometrics() {
            try {
                const checkResult = await BiometricAuth.checkBiometry();
                if (!checkResult.isAvailable) {
                    throw new Error('Biometric authentication is not available on this device');
                }

                await BiometricAuth.authenticate({
                    reason: 'Ontgrendel de app',
                    cancelTitle: 'Gebruik wachtwoord',
                    allowDeviceCredential: true,
                    iosFallbackTitle: 'Gebruik toegangscode',
                    android: {
                        title: 'Ontgrendelen',
                        subtitle: 'Bevestig met je vingerafdruk',
                        confirmationRequired: false,
                    },
                });

                return true;
            } catch (error) {
                console.error('Biometric authentication failed:', error);
                return false;
            }
        },

        async isTokenValid() {
            try {
                const { value: tokenData } = await Preferences.get({ key: 'authToken' });
                if (!tokenData) return false;

                const { value: tokenExpiry } = await Preferences.get({ key: 'authTokenExpiry' });
                if (!tokenExpiry) return false;

                const expiryTime = parseInt(tokenExpiry, 10);
                if (!Number.isFinite(expiryTime)) return false;

                return Date.now() < expiryTime;
            } catch (error) {
                console.error('Error checking token validity:', error);
                return false;
            }
        },

        async saveAuthToken(token, refreshToken, expiryInMinutes = FALLBACK_TOKEN_MINUTES) {
            const expiryTime = decodeJwtExpiry(token) ?? Date.now() + expiryInMinutes * 60 * 1000;

            await Preferences.set({ key: 'authToken', value: token });
            if (refreshToken) {
                await Preferences.set({ key: 'refreshToken', value: refreshToken });
            }
            await Preferences.set({ key: 'authTokenExpiry', value: expiryTime.toString() });
            await Preferences.set({ key: 'hasLoggedInWithCredentials', value: 'true' });

            this.authToken = token;
            this.authTokenExpiry = expiryTime;
            this.hasLoggedInWithCredentials = true;
        },

        /**
         * After a successful token refresh. This used to write only the token, leaving
         * `authTokenExpiry` at its login-time value -- so the router guard threw the user
         * out exactly 60 minutes after logging in no matter how many refreshes had
         * succeeded, which is the opposite of what refresh tokens are for.
         */
        async updateAccessToken(token) {
            const expiryTime = decodeJwtExpiry(token) ?? Date.now() + FALLBACK_TOKEN_MINUTES * 60 * 1000;

            await Preferences.set({ key: 'authToken', value: token });
            await Preferences.set({ key: 'authTokenExpiry', value: expiryTime.toString() });

            this.authToken = token;
            this.authTokenExpiry = expiryTime;
        },

        async clearAuthData({ forgetRefreshToken = false } = {}) {
            await Preferences.remove({ key: 'authToken' });
            await Preferences.remove({ key: 'authTokenExpiry' });
            await Preferences.remove({ key: 'hasLoggedInWithCredentials' });
            if (forgetRefreshToken) {
                await Preferences.remove({ key: 'refreshToken' });
            }

            this.authToken = null;
            this.authTokenExpiry = null;
            this.hasLoggedInWithCredentials = false;
        },

        async setAppActive() {
            await Preferences.set({ key: APP_STATE_KEYS.IS_APP_ACTIVE, value: 'true' });
            await this.touchLastActive();
        },

        async setBiometricVerified(verified) {
            await Preferences.set({ key: APP_STATE_KEYS.BIOMETRIC_VERIFIED, value: verified ? 'true' : 'false' });
        },

        async isBiometricVerified() {
            const { value } = await Preferences.get({ key: APP_STATE_KEYS.BIOMETRIC_VERIFIED });
            return value === 'true';
        },

        async setAppInactive() {
            await Preferences.set({ key: APP_STATE_KEYS.IS_APP_ACTIVE, value: 'false' });
            await Preferences.set({ key: APP_STATE_KEYS.BIOMETRIC_VERIFIED, value: 'false' });
        },

        async resetAppState() {
            await this.setAppInactive();
        },

        /**
         * The browser's version of "unlocked": there is no biometric factor to satisfy, so
         * the token is the credential. Called only from the cold start, and only when the
         * platform reports no biometry -- see lib/coldStart.js for why that distinction
         * matters more than it looks.
         *
         * `biometricVerified` is set here because the router guard requires all three flags
         * and one of them can never be earned on this platform. It is not pretending a
         * fingerprint happened; it is recording that none is required.
         */
        async setAppActiveWithoutBiometry() {
            await Preferences.set({ key: APP_STATE_KEYS.IS_APP_ACTIVE, value: 'true' });
            await Preferences.set({ key: APP_STATE_KEYS.BIOMETRIC_VERIFIED, value: 'true' });
            await this.touchLastActive();
        },

        async isAppActive() {
            const { value } = await Preferences.get({ key: APP_STATE_KEYS.IS_APP_ACTIVE });
            return value === 'true';
        },

        // -- Re-locking after time in the background ---------------------------------
        //
        // docs/v2/05-android-app.md: "re-lock after N minutes in the background -- the
        // `pause` listener currently only logs, and a camera app is precisely the app that
        // should re-lock". This is a re-lock, not a cold start: `isAppActive` stays true and
        // only `biometricVerified` is dropped, so the user gets the fingerprint prompt
        // rather than the password form.

        async touchLastActive() {
            await Preferences.set({ key: APP_STATE_KEYS.LAST_ACTIVE_TIME, value: Date.now().toString() });
        },

        async getRelockMinutes() {
            const { value } = await Preferences.get({ key: APP_STATE_KEYS.RELOCK_MINUTES });
            const parsed = Number.parseInt(value ?? '', 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RELOCK_MINUTES;
        },

        async setRelockMinutes(minutes) {
            await Preferences.set({ key: APP_STATE_KEYS.RELOCK_MINUTES, value: String(minutes) });
        },

        /** Called when the app goes to the background. */
        async markBackgrounded() {
            await this.touchLastActive();
        },

        /**
         * Called when the app comes back. Returns true when the session was re-locked, so
         * the caller can send the user to the login screen.
         */
        async relockIfExpired() {
            if (!(await this.isBiometricVerified())) return false;

            const { value } = await Preferences.get({ key: APP_STATE_KEYS.LAST_ACTIVE_TIME });
            const lastActive = Number.parseInt(value ?? '', 10);
            // No timestamp means we cannot tell how long it has been. Re-locking on a
            // missing value would lock the user out of a session that may be seconds old,
            // so record the moment instead and let the next background start the clock.
            if (!Number.isFinite(lastActive)) {
                await this.touchLastActive();
                return false;
            }

            const limitMs = (await this.getRelockMinutes()) * 60 * 1000;
            if (Date.now() - lastActive < limitMs) return false;

            await this.setBiometricVerified(false);
            return true;
        },

        stashPendingRoute(route) {
            if (route && route !== '/') {
                this.pendingRoute = route;
            }
        },

        takePendingRoute() {
            const route = this.pendingRoute;
            this.pendingRoute = null;
            return route;
        },
    },
});
