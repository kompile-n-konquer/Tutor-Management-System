import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// RootLayout holds the routes back until auth finishes restoring the session;
// feed it a settled auth state through the context module it reads.
const authState = vi.hoisted(() => ({
  currentUser: null,
  role: null,
  userProfile: null,
  loading: false,
  signOut: vi.fn(),
  refreshRole: vi.fn(),
}));

vi.mock('./features/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => authState,
}));

import RootLayout from './RootLayout.jsx';

describe('RootLayout — top-level layout outlet', () => {
  test('renders the matched child route inside a <main> element', () => {
    authState.loading = false;
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<div>home-page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('home-page')).toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  test('holds the routes back behind a placeholder while auth is loading', () => {
    authState.loading = true;
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<div>home-page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Checking your session...')).toBeInTheDocument();
    expect(screen.queryByText('home-page')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toBeInTheDocument();
    authState.loading = false;
  });
});
