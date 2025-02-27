import { defineStore } from 'pinia';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { Preferences } from '@capacitor/preferences';

const APP_STATE_KEYS = {
    IS_APP_ACTIVE: 'isAppActive',
    LAST_ACTIVE_TIME: 'lastActiveTime',
    BIOMETRIC_VERIFIED: 'biometricVerified',
};

export const useAuthStore = defineStore('auth', {
    state: () => ({
        authToken: null,
        authTokenExpiry: null,
        hasLoggedInWithCredentials: false,
    }),

    actions: {
        async authenticateWithBiometrics() {
            try {
                const checkResult = await BiometricAuth.checkBiometry();
                if (!checkResult.isAvailable) {
                    throw new Error('Biometric authentication is not available on this device');
                }

                await BiometricAuth.authenticate({
                    reason: 'Please authenticate to access the app',
                    cancelTitle: 'Use Credentials Instead',
                    allowDeviceCredential: true,
                    iosFallbackTitle: 'Use passcode',
                    android: {
                        title: 'Biometric Authentication',
                        subtitle: 'Authenticate using your fingerprint',
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

                const expiryTime = parseInt(tokenExpiry);
                return Date.now() < expiryTime;
            } catch (error) {
                console.error('Error checking token validity:', error);
                return false;
            }
        },

        async saveAuthToken(token, refreshToken, expiryInMinutes = 60) {
            const expiryTime = Date.now() + expiryInMinutes * 60 * 1000;
            await Preferences.set({ key: 'authToken', value: token });
            await Preferences.set({ key: 'refreshToken', value: refreshToken });
            await Preferences.set({ key: 'authTokenExpiry', value: expiryTime.toString() });
            await Preferences.set({ key: 'hasLoggedInWithCredentials', value: 'true' });

            this.authToken = token;
            this.authTokenExpiry = expiryTime;
            this.hasLoggedInWithCredentials = true;
        },


        async clearAuthData() {
            await Preferences.remove({ key: 'authToken' });
            await Preferences.remove({ key: 'authTokenExpiry' });
            // await Preferences.remove({ key: 'refreshToken' });
            await Preferences.remove({ key: 'hasLoggedInWithCredentials' });

            this.authToken = null;
            this.authTokenExpiry = null;
            this.hasLoggedInWithCredentials = false;
        },

        async setAppActive() {
            await Preferences.set({ key: APP_STATE_KEYS.IS_APP_ACTIVE, value: 'true' });
            await Preferences.set({ key: APP_STATE_KEYS.LAST_ACTIVE_TIME, value: Date.now().toString() });
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

        async isAppActive() {
            const { value } = await Preferences.get({ key: APP_STATE_KEYS.IS_APP_ACTIVE });
            return value === 'true';
        },
    },
});
