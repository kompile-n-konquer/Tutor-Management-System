import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockError } = vi.hoisted(() => ({ mockError: { current: null } }));

// ErrorPage reads the thrown value from the router, so stub useRouteError and
// control it per test instead of throwing inside the render tree.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouteError: () => mockError.current,
}));

import ErrorPage from './ErrorPage.jsx';

const renderErrorPage = () =>
  render(
    <MemoryRouter>
      <ErrorPage />
    </MemoryRouter>,
  );

describe('ErrorPage — router error boundary', () => {
  test('shows the error message and a way back home', () => {
    mockError.current = new Error('Kaboom!');

    renderErrorPage();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Kaboom!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  test('prefers statusText when the thrown value has one', () => {
    mockError.current = Object.assign(new Error('Not Found'), { statusText: '404 — Page Missing' });

    renderErrorPage();

    expect(screen.getByText('404 — Page Missing')).toBeInTheDocument();
  });

  test('falls back to a generic message when the error carries no text', () => {
    // A thrown error with a non-404 status and no text — still a crash page.
    mockError.current = { status: 500 };

    renderErrorPage();

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
  });

  test('renders the 404 page for the catch-all route (no route error at all)', () => {
    mockError.current = undefined;

    renderErrorPage();

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByText('The page you are looking for does not exist.')).toBeInTheDocument();
  });
});
