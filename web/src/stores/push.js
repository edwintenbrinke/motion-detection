import { defineStore } from 'pinia';

/**
 * Push registration state.
 *
 * Kept as a store rather than living inside the push service so Settings can show what is
 * going on -- "notificaties werken niet" is otherwise unanswerable without a cable and
 * logcat.
 *
 * The service that fills it in lives in src/lib/push/. This store never talks to Capacitor
 * itself, so it stays usable in a browser and in tests.
 */
export const usePushStore = defineStore('push', {
    state: () => ({
        /** unsupported | idle | registering | registered | permission_denied | failed */
        status: 'idle',
        token: null,
        deviceId: null,
        lastError: null,
        registeredAt: null,
    }),

    actions: {
        setStatus(status, { error = null } = {}) {
            this.status = status;
            this.lastError = error;
        },

        setRegistered({ token, deviceId }) {
            this.status = 'registered';
            this.token = token;
            this.deviceId = deviceId;
            this.lastError = null;
            this.registeredAt = new Date().toISOString();
        },

        /**
         * Replaced by the real implementation when the push service installs itself. The
         * default keeps Settings functional in a browser, where there is nothing to register.
         */
        async ensureRegistered() {
            if (this.status === 'idle') {
                this.setStatus('unsupported');
            }
        },

        async unregister() {},
    },
});
