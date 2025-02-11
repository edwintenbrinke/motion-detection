import { defineStore } from 'pinia';
import {Preferences} from "@capacitor/preferences";

export const useInitializeStore = defineStore('initialize', {
    state: () => ({
        settings: null,
        user: null
    }),
    actions: {
        async getInitializingInfo(force = false) {
            const { value: token } = await Preferences.get({ key: 'authToken' });
            if (!token) {
                return;
            }

            if (force === false && (this.getUser() !== null && this.getSettings() !== null))
            {
                return
            }

            try {
                const response = await this.$api.get('/api/user/initialize')
                this.settings = response.data.settings
                this.user = response.data.user;
            } catch (error) {
                console.error('Failed to fetch settings:', error)
            }
        },
        getUser() {
            return this.user;
        },
        getSettings() {
            return this.settings;
        },
        getDetectionAreaPoints() {
            return this.settings.detection_area_points
        },
        getImageUrl() {
            return this.settings.placeholder_image_url;
        },
        updateDetectionAreaPoints(points) {
            this.settings.detection_area_points = points;
        }
    },
    persist: true,
});
