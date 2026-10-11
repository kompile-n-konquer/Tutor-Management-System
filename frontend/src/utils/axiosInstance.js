// Single shared API client — every request in the app must go through this
// module (never import axios or call fetch directly). The request interceptor
// attaches the Firebase ID token and the response interceptor retries once
// on 401, which keeps page loads from racing the auth session restore.
import axios from 'axios';
import { auth } from '../firebase/firebase.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
  validateStatus: () => {
    return true; // Resolves promises of responses
  },
});

api.interceptors.request.use(async (config) => {
  if (!config.headers.Authorization) {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// A 401 means the attached ID token was missing, expired or revoked. When a
// user is signed in, force-refresh the token and replay the request exactly
// once; a second 401 (or a failed refresh) is returned to the caller as a
// normal response so pages can render their error state.
api.interceptors.response.use(
  async (response) => {
    const { config } = response;
    if (response.status !== 401 || config._retried401) {
      return response;
    }

    const user = auth.currentUser;
    if (!user) {
      return response;
    }

    config._retried401 = true;
    try {
      const token = await user.getIdToken(true);
      config.headers.Authorization = `Bearer ${token}`;
    } catch {
      return response;
    }

    return api.request(config);
  },
  (error) => Promise.reject(error),
);

export default api;
