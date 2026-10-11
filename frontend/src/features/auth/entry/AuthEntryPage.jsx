import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuthOverlay } from "../overlay/AuthOverlayContext.js";

/**
 * AuthEntryPage — compatibility route for the former /login and /signup
 * pages. Deep links (bookmarks, the unauthenticated guards scattered across
 * pages, ForgotPassword's "Back to Login") land here, which opens the auth
 * overlay on the landing page in the requested mode instead of rendering a
 * standalone page. All real authentication now lives in the overlay.
 */
export default function AuthEntryPage({ mode = "signup" }) {
  const { openAuthOverlay } = useAuthOverlay();

  useEffect(() => {
    openAuthOverlay(mode);
  }, [openAuthOverlay, mode]);

  return <Navigate to="/" replace />;
}
