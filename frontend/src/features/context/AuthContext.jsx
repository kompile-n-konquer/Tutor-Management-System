import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../../firebase/firebase.js";
import api from "../../utils/axiosInstance.js";

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Listen for auth state changes to always get the latest user state
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Signed out — clear user and stop loading
      if (!user) {
        if (mountedRef.current) {
          setCurrentUser(null);
          setLoading(false);
        }
        return;
      }

      // Signed in — fetch the backend User record that carries role and id.
      // During signup the Firebase auth state fires before POST /users
      // commits, so the first GET may 404. Rather than a fixed retry, poll
      // every 500 ms for up to 10 s — the listener waits for the backend
      // to be ready instead of giving up. For login and page refresh the
      // record already exists so the first fetch succeeds immediately.
      const MAX_WAIT = 10_000;
      const INTERVAL = 500;
      const deadline = Date.now() + MAX_WAIT;

      let data = null;
      while (!data && Date.now() < deadline) {
        const res = await api.get(`/users/${user.uid}`);
        if (res?.status === 200 && res.data) {
          data = res.data;
        } else {
          await new Promise((r) => setTimeout(r, INTERVAL));
        }
      }

      if (!mountedRef.current) return;

      if (data) {
        setCurrentUser({ ...user, role: data.role, id: data.id });
      } else {
        // No backend record after retry — cannot enrich the user
        setCurrentUser(null);
      }

      setLoading(false);
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    loading,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("The useAuth must be used within an AuthProvider and not directly");
  }

  return context;
}
