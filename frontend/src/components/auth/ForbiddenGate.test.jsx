import { describe, test, expect } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Outlet, Link } from 'react-router-dom';
import ForbiddenGate from './ForbiddenGate.jsx';
import { FORBIDDEN_EVENT } from '../../utils/forbiddenAccess.js';

function Shell() {
  return (
    <ForbiddenGate>
      <Outlet />
    </ForbiddenGate>
  );
}

function HomePage() {
  return (
    <>
      <p>home page</p>
      <Link to="/other">go to other</Link>
    </>
  );
}

function renderApp(initialPath = '/') {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Shell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'other', element: <p>other page</p> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
  return render(<RouterProvider router={router} />);
}

describe('ForbiddenGate — ownership 403s swap the page for the 404 ErrorPage', () => {
  test('renders the page normally when nothing is forbidden', () => {
    renderApp();
    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });

  test('shows the 404 page when the forbidden event fires', () => {
    renderApp();
    act(() => window.dispatchEvent(new Event(FORBIDDEN_EVENT)));
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.queryByText('home page')).not.toBeInTheDocument();
  });

  test('recovers once the user navigates away via "Back to Home"', async () => {
    renderApp('/other');
    expect(screen.getByText('other page')).toBeInTheDocument();

    act(() => window.dispatchEvent(new Event(FORBIDDEN_EVENT)));
    expect(screen.getByText('Page not found')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to Home'));
    expect(await screen.findByText('home page')).toBeInTheDocument();
    expect(screen.queryByText('Page not found')).not.toBeInTheDocument();
  });
});
