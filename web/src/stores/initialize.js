import { defineStore } from 'pinia';
import {Preferences} from "@capacitor/preferences";

const initState = {
    settings: null,
    user: null
};
export const useInitializeStore = defineStore('initialize', {
    state: () => ({ ...initState }),
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
            return import.meta.env.VITE_API_BASE_URL + this.settings.placeholder_image_url;
        },
        updateDetectionAreaPoints(points) {
            this.settings.detection_area_points = points;
        },
        resetStore() {
            this.$reset();
        }
    },
    persist: true,
});
