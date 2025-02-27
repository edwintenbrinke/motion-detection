import axios from 'axios';
import router from '@/router';
import CookieHelper from "@/utils/CookieHelper.js";
import { useLoadingStore } from "@/stores/loading";
import { useAuthStore } from "@/stores/authentication";
import { Preferences } from '@capacitor/preferences';

// Create an axios instance
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true,
});

let loadingStore = null;

const axiosPlugin = {
    install: (app) => {
        // Initialize the store after Pinia is installed
        loadingStore = useLoadingStore();
        const toast = app.config.globalProperties.$toast;

        // Request interceptor
        apiClient.interceptors.request.use(
            async (config) => {
                console.log('[Axios Request] Starting request:', JSON.stringify({
                    url: import.meta.env.VITE_API_BASE_URL + config.url,
                    method: config.method,
                    headers: config.headers,
                    data: config.data,
                }));

                // Dynamically set the Authorization header with the JWT token
                const { value: token } = await Preferences.get({ key: 'authToken' });
                if (token) {
                    config.headers.Authorization = token;
                }

                loadingStore?.startLoading(); // Use optional chaining
                return config;
            },
            (error) => {
                console.error('[Axios Request] Request error:', JSON.stringify(error));
                loadingStore?.stopLoading();
                return Promise.reject(error);
            }
        );

        // Response interceptor
        apiClient.interceptors.response.use(
            (response) => {
                console.log('[Axios Response] Response received:', JSON.stringify({
                    url: response.config.url,
                    status: response.status,
                    headers: response.headers,
                    data: response.data,
                }));
                loadingStore?.stopLoading();
                return response;
            },
            async (error) => {
                loadingStore?.stopLoading();

                if (error.response) {
                    // Log detailed response error information
                    console.error('[Axios Error] Response error:', JSON.stringify({
                        url: error.response.config.url,
                        status: error.response.status,
                        headers: error.response.headers,
                        data: error.response.data,
                    }));

                    if (error.response.status === 401) {
                        try {
                            console.warn('[Axios Error] 401 Unauthorized: Removing token and logging out');
                            CookieHelper.deleteCookie('username');
                            await useAuthStore().clearAuthData();
                            await apiClient.post('/api/logout');
                            toast.add({
                                severity: 'error',
                                summary: 'Unauthorized',
                                detail: 'Session expired or unauthorized. You will be logged out.',
                                life: 3000,
                            });
                        } catch (logoutError) {
                            CookieHelper.deleteCookie('username');
                            console.error('[Axios Error] Error during logout:', JSON.stringify(logoutError));
                        }
                        router.push('/');
                    }
                } else if (error.request) {
                    console.error('[Axios Error] No response received:', JSON.stringify({
                        url: error.config?.url,
                        method: error.config?.method,
                        headers: error.config?.headers,
                        data: error.config?.data,
                        request: error.request,
                    }));
                } else {
                    console.error('[Axios Error] General error:', JSON.stringify({ message: error.message }));
                }

                return Promise.reject(error);
            }
        );

        app.config.globalProperties.$api = apiClient;
    },
};

// Export both the Axios instance and the plugin
export default axiosPlugin;
export { apiClient };
