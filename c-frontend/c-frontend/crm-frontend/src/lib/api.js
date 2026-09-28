import axios from 'axios';

// Create a centralized Axios instance
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 seconds timeout
});

// Request interceptor to add JWT token to every request
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage (client-side only)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for centralized error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common error scenarios
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;

      // Handle authentication errors
      if (status === 401) {
        // Clear token and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
      }

      // Handle forbidden errors
      if (status === 403) {
        console.error('Access forbidden:', data.message || 'You do not have permission to perform this action');
      }

      // Handle server errors
      if (status >= 500) {
        console.error('Server error:', data.message || 'Something went wrong on the server');
      }
    } else if (error.request) {
      // Request was made but no response received
      console.error('Network error:', 'No response received from server');
    } else {
      // Something else happened while setting up the request
      console.error('Request error:', error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
