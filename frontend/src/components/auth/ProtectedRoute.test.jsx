import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';
import useAuth from '../../hooks/useAuth.js';

vi.mock('../../hooks/useAuth.js', () => ({ default: vi.fn() }));

function renderGuard({ auth, allowedRoles }) {
  useAuth.mockReturnValue(auth);
  const router = createMemoryRouter(
    [
      {
        path: '/protected',
        element: (
          <ProtectedRoute allowedRoles={allowedRoles}>
            <p>secret page</p>
          </ProtectedRoute>
        ),
      },
      { path: '/login', element: <p>login page</p> },
    ],
    { initialEntries: ['/protected'] },
  );
  return render(<RouterProvider router={router} />);
}

const signedIn = (role) => ({ currentUser: { uid: 'u1', role }, role, loading: false });

describe('ProtectedRoute — unauthorized route access shows the 404 ErrorPage', () => {
  test('renders the page when the signed-in role is allowed', () => {
    renderGuard({ auth: signedIn('lecturer'), allowedRoles: ['lecturer'] });
    expect(screen.getByText('secret page')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });

  test('shows the 404 page when the signed-in role is not allowed', () => {
    renderGuard({ auth: signedIn('tutor'), allowedRoles: ['lecturer'] });
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.queryByText('secret page')).not.toBeInTheDocument();
  });

  test('shows the 404 page when the profile has no role', () => {
    renderGuard({ auth: signedIn(null), allowedRoles: ['lecturer'] });
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  test('redirects signed-out visitors to the login page', async () => {
    renderGuard({
      auth: { currentUser: null, role: null, loading: false },
      allowedRoles: ['lecturer'],
    });
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  test('renders nothing while the auth profile is still loading', () => {
    const { container } = renderGuard({
      auth: { currentUser: null, role: null, loading: true },
      allowedRoles: ['lecturer'],
    });
    expect(container).toBeEmptyDOMElement();
  });

  test('allows any signed-in role when no allowedRoles are given', () => {
    renderGuard({ auth: signedIn('organiser') });
    expect(screen.getByText('secret page')).toBeInTheDocument();
  });
});
