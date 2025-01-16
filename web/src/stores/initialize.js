// stores/loadingStore.js
import { defineStore } from 'pinia';

export const useLoadingStore = defineStore('initialize', {
    state: () => ({
        settings: [],
        user: []
    }),
    actions: {
        async getInitializingInfo() {
            try {
                const response = await this.$api.get('/api/user/initialize')
                this.settings = response.data.settings
                this.user = response.data.user;
            } catch (error) {
                console.error('Failed to fetch settings:', error)
            }
        },
        stopLoading() {
            this.isLoading = false;
        },
    },
});
