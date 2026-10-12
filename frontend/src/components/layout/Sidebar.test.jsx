import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

const { mockSignOut, mockAuthState } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockAuthState: { role: 'tutor', userProfile: null, currentUser: { uid: 'u1' } },
}));

// Sidebar reads its links straight from useAuth(); mock the hook so the suite
// stays Firebase-free and each case can set the signed-in user's role.
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({
    currentUser: mockAuthState.currentUser,
    userProfile: mockAuthState.userProfile,
    role: mockAuthState.role,
    loading: false,
    signOut: mockSignOut,
  }),
}));

const renderSidebar = (role = 'tutor') => {
  mockAuthState.role = role;
  return render(
    <MemoryRouter initialEntries={['/current']}>
      <Routes>
        <Route path="/current" element={<Sidebar />} />
        <Route path="/" element={<div>home-page</div>} />
        <Route path="/settings" element={<div>settings-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('Sidebar — role-aware navigation rail', () => {
  test('defaults to the tutor navigation when no role is given', () => {
    renderSidebar();

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Timesheets')).toBeInTheDocument();
    expect(screen.queryByText('Allocation')).not.toBeInTheDocument();
  });

  test('organisers see the dashboard, allocation board and analytics — no tutor-only links', () => {
    renderSidebar('organiser');

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Allocation')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    expect(screen.getByText('Configurations')).toBeInTheDocument();
    // The old Resolve Conflicts button had no handler — it must not come back.
    expect(screen.queryByText('Resolve Conflicts')).not.toBeInTheDocument();
    expect(screen.queryByText('Volunteer View')).not.toBeInTheDocument();
  });

  test('tutors do not see the organiser-only configurations link', () => {
    renderSidebar('tutor');
    expect(screen.queryByText('Configurations')).not.toBeInTheDocument();
  });

  test('lecturers no longer see the non-functional Resolve Conflicts shortcut', () => {
    renderSidebar('lecturer');
    expect(screen.queryByText('Resolve Conflicts')).not.toBeInTheDocument();
  });

  test('students see the onboarding link, and no dashboard or tutor-only links', () => {
    renderSidebar('student');

    expect(screen.getByText('Become a Tutor/Lecturer')).toBeInTheDocument();
    expect(screen.queryByText('Volunteer View')).not.toBeInTheDocument();
    // Students have no dashboard items — the unified dashboard is staff-only.
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  test('clicking Settings navigates to the settings page', () => {
    renderSidebar('tutor');

    fireEvent.click(screen.getByText('Settings'));
    expect(screen.getByText('settings-page')).toBeInTheDocument();
  });

  test('clicking Logout signs the user out and returns home', async () => {
    renderSidebar('tutor');

    fireEvent.click(screen.getByText('Logout'));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    // handleNavigate awaits signOut before navigating, so wait for the route change.
    expect(await screen.findByText('home-page')).toBeInTheDocument();
  });

  test('shows the profile name and initials when the profile is loaded', () => {
    mockAuthState.userProfile = { firstName: 'Thabo', lastName: 'Mokoena' };

    renderSidebar('tutor');

    expect(screen.getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('TM')).toBeInTheDocument();
    expect(screen.queryByText('Guest')).not.toBeInTheDocument();
  });

  test('falls back to the Guest label and generic initial for a sparse profile', () => {
    mockAuthState.userProfile = {};

    renderSidebar('tutor');

    expect(screen.getByText('Guest')).toBeInTheDocument();
    expect(screen.getByText('U')).toBeInTheDocument();
  });

  test('derives the display name from the email when there is no profile', () => {
    mockAuthState.userProfile = null;
    mockAuthState.currentUser = { uid: 'u1', email: 'thabo@wits.ac.za' };

    renderSidebar('tutor');

    expect(screen.getByText('thabo@wits.ac.za')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
