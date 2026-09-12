import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "../../firebase/firebase.js";
import api from "../../utils/axiosInstance.js";

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes to always get the latest user state  
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const response = await api.get(`/users/${user.uid}`);
      if(response && response.status === 200 && response.data) {
        setCurrentUser({ ...user, role: response.data.role, id: response.data.id });
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setCurrentUser(null);
  }

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
