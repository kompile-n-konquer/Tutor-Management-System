import { createContext, useContext } from "react";

/**
 * AuthOverlayContext — shared state for the landing-page authentication
 * overlay (the sliding Login / Sign Up modal). The provider lives in
 * RootLayout so both the landing page CTAs and the /login, /signup entry
 * pages can drive the same overlay instance.
 */
const AuthOverlayContext = createContext(null);

export function useAuthOverlay() {
  const context = useContext(AuthOverlayContext);

  if (context === null) {
    throw new Error("useAuthOverlay must be used within an AuthOverlayProvider and not directly");
  }

  return context;
}

export default AuthOverlayContext;
