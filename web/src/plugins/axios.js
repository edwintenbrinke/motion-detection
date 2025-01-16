import axios from 'axios';
import router from '@/router';
import CookieHelper from "@/utils/CookieHelper.js";
import { useLoadingStore } from "@/stores/loading";
import { Preferences } from '@capacitor/preferences';

// Create an axios instance
const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    withCredentials: true,
});

let loadingStore = null;

export default {
    install: (app) => {
        // Initialize the store after Pinia is installed
        loadingStore = useLoadingStore();

        // Request interceptor
        apiClient.interceptors.request.use(
            async (config) => {
                console.log('[Axios Request] Starting request:', JSON.stringify({
                    url: config.url,
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
                            console.warn('[Axios Error] 401 Unauthorized: Logging out');
                            await apiClient.post('/api/logout');
                        } catch (logoutError) {
                            CookieHelper.deleteCookie('username');
                            console.error('[Axios Error] Error during logout:', JSON.stringify(logoutError));
                        }
                        router.push('/');
                    }
                } else if (error.request) {
                    // Log request information if no response was received
                    console.error('[Axios Error] No response received:', JSON.stringify({
                        url: error.config?.url,
                        method: error.config?.method,
                        headers: error.config?.headers,
                        data: error.config?.data,
                        request: error.request,
                    }));
                    console.error('[Axios Error] This might be a network issue or a CORS error. Check the browser console for more details.');
                } else {
                    // Log generic errors
                    console.error('[Axios Error] General error:', JSON.stringify({ message: error.message }));
                }

                return Promise.reject(error);
            }
        );

        app.config.globalProperties.$api = apiClient;
    },
};
