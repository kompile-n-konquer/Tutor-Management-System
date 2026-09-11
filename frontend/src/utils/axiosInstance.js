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

export default api;
