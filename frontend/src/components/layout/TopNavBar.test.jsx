import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TopNavBar from './TopNavBar.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));
// The search bar now fetches /courses through axios on mount; mock the API
// client with a never-settling promise so the Firebase import chain stays out
// of this suite and the late state update cannot fire outside act().
vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: vi.fn().mockReturnValue(new Promise(() => {})) },
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

  test('renders the global search box by default', () => {
    renderTopNavBar();
    expect(
      screen.getByPlaceholderText('Search courses, people, timesheets...'),
    ).toBeInTheDocument();
  });

  test('hides the search box when showSearch is false', () => {
    renderTopNavBar({ showSearch: false });
    expect(
      screen.queryByPlaceholderText('Search courses, people, timesheets...'),
    ).not.toBeInTheDocument();
  });

  test('shows the avatar image when an avatarUrl is provided', () => {
    renderTopNavBar({ avatarUrl: 'https://example.com/me.png' });
    expect(screen.getByAltText('User avatar')).toHaveAttribute('src', 'https://example.com/me.png');
  });

  test('falls back to the person icon when no avatarUrl is provided', () => {
    renderTopNavBar();
    expect(screen.getByText('person')).toBeInTheDocument();
  });
});
