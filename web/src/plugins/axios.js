import axios from 'axios';
import router from '@/router';
import CookieHelper from "@/utils/CookieHelper.js";
import { useLoadingStore } from "@/stores/loading";

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
            (config) => {
                loadingStore?.startLoading();  // Use optional chaining
                return config;
            },
            (error) => {
                loadingStore?.stopLoading();
                return Promise.reject(error);
            }
        );

        // Response interceptor
        apiClient.interceptors.response.use(
            (response) => {
                loadingStore?.stopLoading();
                return response;
            },
            async (error) => {
                loadingStore?.stopLoading();

                if (error.response) {
                    if (error.response.status === 401) {
                        try {
                            await apiClient.post('/api/logout');
                        } catch (logoutError) {
                            CookieHelper.deleteCookie('username');
                            console.error('Error during logout:', logoutError);
                        }
                        router.push('/');
                    }
                }
                return Promise.reject(error);
            }
        );

        app.config.globalProperties.$api = apiClient;
    },
};
