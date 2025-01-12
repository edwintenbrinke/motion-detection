import axios from 'axios';

// Create an axios instance
const apiClient = axios.create({
  baseURL: 'https://localhost', //process.env.VUE_APP_API_BASE_URL || 'http://localhost', // Replace with your API base URL
  timeout: 10000, // Request timeout in milliseconds
  headers: {
    'Content-Type': 'application/json',
  },
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
    console.error('API error:', error);
    return Promise.reject(error);
  }
);

export default {
  install: (app) => {
    app.config.globalProperties.$api = apiClient; // Attach to Vue instance
  },
};
