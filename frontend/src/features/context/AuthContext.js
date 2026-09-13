import { createContext, useContext } from "react";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("The useAuth must be used within an AuthProvider and not directly");
  }

  return context;
}

export default AuthContext;
