import axios from 'axios';
import router from '@/router';
import CookieHelper from "@/utils/CookieHelper.js";
import { useLoadingStore } from "@/stores/loading";
import { useAuthStore } from "@/stores/authentication";
import { Preferences } from '@capacitor/preferences';

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true,
});

let isRefreshing = false;
let refreshSubscribers = [];

const addRefreshSubscriber = (callback) => {
    refreshSubscribers.push(callback);
};

const notifyRefreshSubscribers = (token) => {
    refreshSubscribers.forEach(cb => cb(token));
    refreshSubscribers = [];
};

const axiosPlugin = {
    install: (app) => {
        const loadingStore = useLoadingStore();
        const authStore = useAuthStore();
        const toast = app.config.globalProperties.$toast;

        apiClient.interceptors.request.use(
            async (config) => {
                const { value: token } = await Preferences.get({ key: 'authToken' });
                if (token) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                loadingStore?.startLoading();
                return config;
            },
            (error) => {
                loadingStore?.stopLoading();
                return Promise.reject(error);
            }
        );

        apiClient.interceptors.response.use(
            (response) => {
                loadingStore?.stopLoading();
                return response;
            },
            async (error) => {
                loadingStore?.stopLoading();
                const originalRequest = error.config;

                if (!error.response) {
                    console.error('[Axios Error] No response received:', error);
                    return Promise.reject(error);
                }

                const { status, data } = error.response;

                if (status === 401) {
                    if (data?.message?.includes('Invalid or expired refresh token')) {
                        await authStore.clearAuthData();
                        await apiClient.post('/api/logout');

                        toast.add({
                            severity: 'error',
                            summary: 'Session Expired',
                            detail: 'Your session has expired. Please log in again.',
                            life: 3000,
                        });

                        isRefreshing = false;
                        await Preferences.clear();
                        await router.push('/');
                        return Promise.reject(error);
                    }

                    if (!originalRequest._retry) {
                        originalRequest._retry = true;

                        if (!isRefreshing) {
                            isRefreshing = true;
                            const { value: refreshToken } = await Preferences.get({ key: 'refreshToken' });
                            if (!refreshToken) throw new Error('No refresh token available');

                            const response = await apiClient.post('/api/token/refresh', { refresh_token: refreshToken });
                            const newToken = response.data.token;
                            await Preferences.set({ key: 'authToken', value: newToken });

                            isRefreshing = false;
                            notifyRefreshSubscribers(newToken);

                            originalRequest.headers.Authorization = `Bearer ${newToken}`;
                            return apiClient(originalRequest);
                        } else {
                            console.log('redo OG')
                            return new Promise((resolve) => {
                                addRefreshSubscriber((token) => {
                                    originalRequest.headers.Authorization = `Bearer ${token}`;
                                    resolve(apiClient(originalRequest));
                                });
                            });
                        }
                    }
                }
                return Promise.reject(error);
            }
        );

        app.config.globalProperties.$api = apiClient;
    },
};

export default axiosPlugin;
export { apiClient };
