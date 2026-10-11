import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../../features/context/ThemeProvider.jsx';
import TopNavBar from './TopNavBar.jsx';

vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
}));
// The search bar now fetches /courses through axios on mount; mock the API
// client with a never-settling promise so the Firebase import chain stays out
// of this suite and the late state update cannot fire outside act().
vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: vi.fn().mockReturnValue(new Promise(() => {})) },
}));

// The top bar's theme toggle reads the ThemeProvider context, so every render
// is wrapped in the real provider — same as the app mounts it.
const renderTopNavBar = (props, route = '/current') =>
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/current" element={<TopNavBar {...props} />} />
          <Route path="/profile" element={<div>profile-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
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

  test('toggles the theme between light and dark', () => {
    renderTopNavBar();

    // Light by default — the toggle offers switching to dark mode.
    const toggle = screen.getByRole('button', { name: /switch to dark mode/i });
    fireEvent.click(toggle);

    // The provider now reports dark mode: the button flips its label and the
    // document root carries the dark class.
    expect(screen.getByRole('button', { name: /switch to light mode/i })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  test('toggles back to light mode when clicked from dark', () => {
    // The previous test leaves dark mode active; start from a clean slate.
    window.localStorage.clear();
    document.documentElement.className = '';
    renderTopNavBar();

    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));
    fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));

    expect(screen.getByRole('button', { name: /switch to dark mode/i })).toBeInTheDocument();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  test('navigates to the profile page from the avatar button', () => {
    renderTopNavBar();

    fireEvent.click(screen.getByRole('button', { name: /open profile/i }));

    expect(screen.getByText('profile-page')).toBeInTheDocument();
  });
});
