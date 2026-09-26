import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import ErrorPage from '../error-page/ErrorPage.jsx';

/**
 * Route-level authorization guard used by every protected route in Router.jsx.
 *
 * - While the auth profile is still loading it renders nothing, so protected
 *   pages never flash before the role is known.
 * - Signed-out visitors go to the login page — that is authentication, not
 *   authorization.
 * - Signed-in users whose role is not in `allowedRoles` see the 404 ErrorPage
 *   instead of a generic error, so unauthorized routes are indistinguishable
 *   from missing ones. Omitting `allowedRoles` allows any signed-in role.
 * - This component is the single route guard: pages must not re-implement
 *   auth redirects in their own effects, so every route behaves the same.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { currentUser, role, loading } = useAuth();

  if (loading) return null;

  if (!currentUser) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(role)) return <ErrorPage />;

  return children ?? <Outlet />;
}
