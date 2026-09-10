import { onAuthStateChanged, getIdToken } from 'firebase/auth';
import { redirect } from 'react-router-dom';
import { auth } from '../firebase/firebase.js';
import api from './axiosInstance.js';
import { ROLE_HOME_ROUTE } from '../constants/roles.js';

async function getCurrentUserToken() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        resolve(null);
        return;
      }
      try {
        const token = await getIdToken(user, false);
        resolve(token);
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function createRoleLoader(allowedRoles) {
  return async function roleLoader() {
    const token = await getCurrentUserToken();

    if (!token) {
      return redirect('/login');
    }

    const roleList = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const params = new URLSearchParams({ roles: roleList.join(',') });

    const verifyResponse = await api.get(`/users/verify-role?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (verifyResponse.status === 200 && verifyResponse.data.allowed) {
      return null;
    }

    const meResponse = await api.get('/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (meResponse.status === 200 && meResponse.data.role) {
      const homeRoute = ROLE_HOME_ROUTE[meResponse.data.role.toLowerCase()];
      if (homeRoute) {
        return redirect(homeRoute);
      }
    }

    return redirect('/login');
  };
}
