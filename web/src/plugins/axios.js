import axios from 'axios';
import router from '@/router';
import CookieHelper from "@/utils/CookieHelper.js";

// Create an axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withCredentials: true,
});

// Interceptor for requests
apiClient.interceptors.request.use(
    (config) => {
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
);

// Interceptor for responses
apiClient.interceptors.response.use(
    (response) => {
      return response;
    },
    async (error) => {
      if (error.response) {
        // Check if the status code is 401
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

export default {
  install: (app) => {
    app.config.globalProperties.$api = apiClient; // Attach to Vue instance
  },
};
