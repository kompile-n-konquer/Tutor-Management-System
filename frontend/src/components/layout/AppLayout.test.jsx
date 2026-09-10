import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from './AppLayout.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));

describe('AppLayout — shared chrome for authenticated pages', () => {
  test('renders the sidebar, top bar and the page content', () => {
    render(
      <MemoryRouter>
        {/* A title that is not also a sidebar link, so the query stays unique. */}
        <AppLayout role="tutor" title="My Page Title" showSearch={true}>
          <div>page-content</div>
        </AppLayout>
      </MemoryRouter>,
    );

    // Sidebar rendered with the tutor role.
    expect(screen.getByText('Tutor Dashboard')).toBeInTheDocument();
    // TopNavBar rendered with the title prop.
    expect(screen.getByText('My Page Title')).toBeInTheDocument();
    // Page content rendered inside <main>.
    expect(screen.getByText('page-content')).toBeInTheDocument();
  });
});
