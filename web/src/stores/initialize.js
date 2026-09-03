import { defineStore } from 'pinia';
import { Preferences } from '@capacitor/preferences';
import { api } from '@/api';
import { API_BASE_URL } from '@/lib/env.js';

const initState = {
    settings: null,
    user: null,
};

export const useInitializeStore = defineStore('initialize', {
    state: () => ({ ...initState }),

    actions: {
        async getInitializingInfo(force = false) {
            const { value: token } = await Preferences.get({ key: 'authToken' });
            if (!token) {
                return;
            }

            if (force === false && this.user !== null && this.settings !== null) {
                return;
            }

            try {
                const data = await api.auth.initialize();
                this.settings = data.settings;
                this.user = data.user;
            } catch (error) {
                console.error('Failed to fetch settings:', error?.message);
            }
        },

        getUser() {
            return this.user;
        },

        getSettings() {
            return this.settings;
        },

        getDetectionAreaPoints() {
            return this.settings?.detection_area_points ?? [];
        },

        /**
         * The v1 zone editor's backdrop: a frame the API fetched from the Pi and wrote to
         * disk. In v2 this becomes `GET /api/cameras/{cam}/snapshot.jpg` -- a live frame
         * from Frigate with no Pi round-trip -- which is what `api.cameras.snapshotUrl`
         * returns. Kept as a fallback until the zone editor is rebuilt, so the current
         * screen keeps working against the current API.
         */
        getImageUrl() {
            if (!this.settings?.placeholder_image_url) return null;
            return API_BASE_URL + this.settings.placeholder_image_url;
        },

        resetStore() {
            this.$reset();
        },
    },

    persist: true,
});
