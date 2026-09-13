import { useEffect, useState, useCallback } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../../firebase/firebase.js";
import api from "../../utils/axiosInstance.js";
import AuthContext from "./AuthContext.js";

export default function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      const response = await api.get('/users/me');
      if (response.status === 200) {
        setRole(response.data.role?.toLowerCase() || null);
        setUserProfile(response.data);
        return response.data;
      }
    } catch {
      // ignore — caller handles null role
    }
    setRole(null);
    setUserProfile(null);
    return null;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        await fetchProfile();
      } else {
        setRole(null);
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchProfile]);

  /**
   * Re-fetch the user profile and role from the backend.
   * Useful after signup when the DB user is created *after* onAuthStateChanged fires.
   */
  const refreshRole = useCallback(async () => {
    return await fetchProfile();
  }, [fetchProfile]);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
    setRole(null);
    setUserProfile(null);
  }

  const value = {
    currentUser,
    role,
    userProfile,
    loading,
    signOut,
    refreshRole,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
