import axios from 'axios';
import { auth } from '../firebase/firebase';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
  validateStatus: () => {
    return true; // Resolves promises of responses
  },
});

// Attach the signed-in user's Firebase ID token to every request, so authenticated
// endpoints receive it without each caller building the header manually.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }
  return config;
});

export default api;
