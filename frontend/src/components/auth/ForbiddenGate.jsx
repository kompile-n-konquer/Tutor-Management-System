import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ErrorPage from '../error-page/ErrorPage.jsx';
import { FORBIDDEN_EVENT } from '../../utils/forbiddenAccess.js';

/**
 * Swaps the application shell for the 404 ErrorPage when the API reports a
 * forbidden (403) resource — for example a lecturer opening a course owned by
 * another lecturer. The URL is intentionally kept, so the resource stays
 * hidden behind the same "Page not found" response a missing route gives.
 * Navigating anywhere else (such as "Back to Home") lifts the block because
 * the blocked path no longer matches the current one.
 */
export default function ForbiddenGate({ children }) {
  // Pathname at which a forbidden response arrived — compared against the live
  // location on every render, so no reset effect is needed when the user moves.
  const [forbiddenPath, setForbiddenPath] = useState(null);
  const { pathname } = useLocation();

  useEffect(() => {
    // Re-subscribed on every navigation so the listener always blocks the path
    // the user is currently on.
    const showForbiddenPage = () => setForbiddenPath(pathname);
    window.addEventListener(FORBIDDEN_EVENT, showForbiddenPage);
    return () => window.removeEventListener(FORBIDDEN_EVENT, showForbiddenPage);
  }, [pathname]);

  if (forbiddenPath === pathname) return <ErrorPage />;

  return children;
}
