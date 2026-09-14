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

  // Pages read role/id off currentUser (e.g. currentUser?.role?.toLowerCase(),
  // currentUser.id for supervisorId checks), so once the backend profile is
  // available we enrich the Firebase user with role and id — same shape the
  // old monolithic AuthContext produced.
  const applyProfile = useCallback(async (user) => {
    const profile = await fetchProfile();
    if (user) {
      setCurrentUser(
        profile
          ? { ...user, role: profile.role?.toLowerCase(), id: profile.id }
          : user,
      );
    }
    return profile;
  }, [fetchProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await applyProfile(user);
      } else {
        setCurrentUser(null);
        setRole(null);
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [applyProfile]);

  /**
   * Re-fetch the user profile and role from the backend.
   * Useful after signup when the DB user is created *after* onAuthStateChanged fires.
   */
  const refreshRole = useCallback(async () => {
    return await applyProfile(auth.currentUser);
  }, [applyProfile]);

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
