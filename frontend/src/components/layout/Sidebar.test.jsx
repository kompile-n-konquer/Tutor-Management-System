import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

const { mockSignOut } = vi.hoisted(() => ({ mockSignOut: vi.fn() }));

// Sidebar only needs the useAuth hook; mocking the module keeps Firebase out of this test.
vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: mockSignOut }),
}));

const renderSidebar = (role) =>
  render(
    <MemoryRouter initialEntries={['/current']}>
      <Routes>
        <Route path="/current" element={<Sidebar role={role} />} />
        <Route path="/" element={<div>home-page</div>} />
        <Route path="/settings" element={<div>settings-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Sidebar — role-aware navigation rail', () => {
  test('defaults to the tutor navigation when no role is given', () => {
    renderSidebar();

    expect(screen.getByText('Tutor Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Timesheets')).toBeInTheDocument();
    expect(screen.queryByText('Allocation Board')).not.toBeInTheDocument();
  });

  test('organisers see the allocation board and the conflict-resolution button', () => {
    renderSidebar('organiser');

    expect(screen.getByText('Allocation Board')).toBeInTheDocument();
    expect(screen.getByText('Resolve Conflicts')).toBeInTheDocument();
  });

  test('lecturers also see the conflict-resolution button', () => {
    renderSidebar('lecturer');
    expect(screen.getByText('Resolve Conflicts')).toBeInTheDocument();
  });

  test('students see the profile link instead of tutor pages', () => {
    renderSidebar('student');

    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.queryByText('Tutor Dashboard')).not.toBeInTheDocument();
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
});
