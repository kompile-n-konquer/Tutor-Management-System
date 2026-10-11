import { useCallback, useEffect, useMemo, useState } from "react";
import AuthOverlayContext from "./AuthOverlayContext.js";

const AUTH_MODES = ["login", "signup"];

/**
 * AuthOverlayProvider — owns the open/closed state and the active mode
 * (login | signup) of the authentication overlay. Also handles the modal
 * side effects: locking page scroll and closing on Escape while open.
 */
export default function AuthOverlayProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState("signup");

  const openAuthOverlay = useCallback((nextMode = "signup") => {
    setMode(AUTH_MODES.includes(nextMode) ? nextMode : "signup");
    setIsOpen(true);
  }, []);

  const closeAuthOverlay = useCallback(() => setIsOpen(false), []);

  // In-overlay switching — keeps the modal open while the panels slide.
  const switchAuthMode = useCallback((nextMode) => {
    if (AUTH_MODES.includes(nextMode)) setMode(nextMode);
  }, []);

  // The landing page stays visible behind the backdrop, so page scrolling
  // must pause while the overlay is up.
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Escape returns the user to the landing page.
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeAuthOverlay();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeAuthOverlay]);

  const value = useMemo(
    () => ({ isOpen, mode, openAuthOverlay, closeAuthOverlay, switchAuthMode }),
    [isOpen, mode, openAuthOverlay, closeAuthOverlay, switchAuthMode],
  );

  return <AuthOverlayContext.Provider value={value}>{children}</AuthOverlayContext.Provider>;
}
