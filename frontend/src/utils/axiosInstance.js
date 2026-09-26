import axios from 'axios';
import { auth } from '../firebase/firebase.js';
import { isForbiddenResource, notifyForbidden } from './forbiddenAccess.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_BASE_URL,
  validateStatus: () => {
    return true; // Resolves promises of responses
  },
});

api.interceptors.request.use(async (config) => {
  // Remember where the request was fired from so a late 403 from an abandoned
  // page cannot hijack a different page the user has navigated to since.
  config.metadata = { pathname: window.location.pathname };
  if (!config.headers.Authorization) {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Ownership 403s on resource-detail endpoints are surfaced as the 404 page
// (see forbiddenAccess.js) so no page has to hand-roll "you can't see this".
api.interceptors.response.use((response) => {
  const samePage = response.config?.metadata?.pathname === window.location.pathname;
  if (samePage && isForbiddenResource(response.status, response.config?.url)) {
    notifyForbidden();
  }
  return response;
});

export default api;
