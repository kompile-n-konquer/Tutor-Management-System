import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TopNavBar from './TopNavBar.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));

const renderTopNavBar = (props, route = '/current') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/current" element={<TopNavBar {...props} />} />
        <Route path="/profile" element={<div>profile-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('TopNavBar — page header with search and avatar', () => {
  test('shows the default title when none is provided', () => {
    renderTopNavBar();
    expect(screen.getByText('Tutor Management System')).toBeInTheDocument();
  });

  test('shows the title supplied by the page', () => {
    renderTopNavBar({ title: 'Tutor Dashboard' });
    expect(screen.getByText('Tutor Dashboard')).toBeInTheDocument();
  });

  test('renders the search box by default', () => {
    renderTopNavBar();
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
  });

  test('hides the search box when showSearch is false', () => {
    renderTopNavBar({ showSearch: false });
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  test('shows the avatar image when an avatarUrl is provided', () => {
    renderTopNavBar({ avatarUrl: 'https://example.com/me.png' });
    expect(screen.getByAltText('User avatar')).toHaveAttribute('src', 'https://example.com/me.png');
  });

  test('falls back to the person icon and navigates to the profile on click', () => {
    renderTopNavBar();

    fireEvent.click(screen.getByText('person'));
    expect(screen.getByText('profile-page')).toBeInTheDocument();
  });
});
