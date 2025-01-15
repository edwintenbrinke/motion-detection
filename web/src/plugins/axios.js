import axios from 'axios';

// Create an axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000, // Request timeout in milliseconds
  withCredentials: true
});

// Interceptor for requests
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token or modify headers here if needed
    // config.headers.Authorization = `Bearer ${yourAuthToken}`;
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
  (error) => {
    // Handle errors globally if needed
    console.error('API error:', JSON.stringify(error));
    return Promise.reject(error);
  }
);

export default {
  install: (app) => {
    app.config.globalProperties.$api = apiClient; // Attach to Vue instance
  },
};
