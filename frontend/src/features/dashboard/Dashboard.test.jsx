import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// The page shells under test are the role sections and the priority feed —
// AppLayout's own wiring (sidebar, search, theme) has its dedicated suite.
vi.mock('../../components/layout/AppLayout.jsx', () => ({
  default: ({ title, children }) => (
    <div>
      <p>layout:{title}</p>
      {children}
    </div>
  ),
}));

const { authState, alertsState } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1' }, role: 'tutor', loading: false },
  alertsState: {
    items: [],
    isLoading: false,
    loadError: '',
    lastRefreshedAt: null,
    refresh: vi.fn(),
  },
}));

vi.mock('../../hooks/useAuth.js', () => ({ default: () => authState }));
vi.mock('../../hooks/useDashboardAlerts.js', () => ({ default: () => alertsState }));
// The role sections have their own suites; stub them so this file pins the
// Dashboard's routing between feed and sections.
vi.mock('./TutorSchedule.jsx', () => ({ default: () => <div>tutor-schedule-stub</div> }));
vi.mock('./LecturerCourses.jsx', () => ({ default: () => <div>lecturer-courses-stub</div> }));

import Dashboard from './Dashboard.jsx';

const renderDashboard = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Dashboard — one page, every role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(authState, { currentUser: { uid: 'u1' }, role: 'tutor', loading: false });
    Object.assign(alertsState, {
      items: [],
      isLoading: false,
      loadError: '',
      lastRefreshedAt: null,
    });
  });

  test('redirects to login when nobody is signed in', () => {
    authState.currentUser = null;

    renderDashboard();

    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('Needs your attention')).not.toBeInTheDocument();
  });

  test('renders the shell while auth restores instead of redirecting', () => {
    authState.currentUser = null;
    authState.loading = true;
    authState.role = null;

    renderDashboard();

    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
    expect(screen.getByText('layout:Dashboard')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    // No role yet — the generic blurb speaks while the profile loads.
    expect(screen.getByText('Everything that needs your attention.')).toBeInTheDocument();
  });

  test('gives tutors their schedule under the live feed', () => {
    renderDashboard();

    expect(
      screen.getByText('Your schedule, cover requests and timesheets — what needs you comes first.'),
    ).toBeInTheDocument();
    expect(screen.getByText('tutor-schedule-stub')).toBeInTheDocument();
    expect(screen.queryByText('lecturer-courses-stub')).not.toBeInTheDocument();
  });

  test('gives lecturers their courses section under the live feed', () => {
    authState.role = 'lecturer';

    renderDashboard();

    expect(screen.getByText('Your courses, cover decisions and timesheet reviews.')).toBeInTheDocument();
    expect(screen.getByText('lecturer-courses-stub')).toBeInTheDocument();
    expect(screen.queryByText('tutor-schedule-stub')).not.toBeInTheDocument();
  });

  test.each(['organiser', 'admin'])('gives %s the staffing tool cards', (role) => {
    authState.role = role;

    renderDashboard();

    expect(screen.getByText('Staffing, reviews and approvals across the school.')).toBeInTheDocument();
    expect(screen.getByText('Your tools')).toBeInTheDocument();
    // Each card links to where its attention items get resolved.
    expect(screen.getByRole('link', { name: /allocation/i })).toHaveAttribute('href', '/organiser');
    expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute(
      'href',
      '/organiser-analytics',
    );
    expect(screen.getByRole('link', { name: /timesheets/i })).toHaveAttribute('href', '/timesheets');
    expect(screen.getByRole('link', { name: /swap approvals/i })).toHaveAttribute(
      'href',
      '/swap-review',
    );
    expect(screen.getByRole('link', { name: /^applications/i })).toHaveAttribute(
      'href',
      '/application-review',
    );
    expect(screen.getByRole('link', { name: /^courses/i })).toHaveAttribute('href', '/courses');
    expect(screen.queryByText('tutor-schedule-stub')).not.toBeInTheDocument();
    expect(screen.queryByText('lecturer-courses-stub')).not.toBeInTheDocument();
  });

  test('gives students their next steps', () => {
    authState.role = 'student';

    renderDashboard();

    expect(screen.getByText('Your applications and next steps.')).toBeInTheDocument();
    expect(screen.getByText('Next steps')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /applications/i })).toHaveAttribute(
      'href',
      '/applications',
    );
    expect(screen.getByRole('link', { name: /timetable/i })).toHaveAttribute(
      'href',
      '/timetable/edit',
    );
    expect(screen.getByRole('link', { name: /become a tutor/i })).toHaveAttribute(
      'href',
      '/onboarding',
    );
  });

  test('unknown roles still get the feed and the generic blurb', () => {
    authState.role = 'wizard';

    renderDashboard();

    expect(screen.getByText('Everything that needs your attention.')).toBeInTheDocument();
    expect(screen.getByText('Needs your attention')).toBeInTheDocument();
    expect(screen.queryByText('tutor-schedule-stub')).not.toBeInTheDocument();
    expect(screen.queryByText('lecturer-courses-stub')).not.toBeInTheDocument();
    expect(screen.queryByText('Your tools')).not.toBeInTheDocument();
  });

  test('wires the live priority feed into the panel', () => {
    alertsState.items = [
      {
        id: 'a1',
        type: 'swap-incoming',
        severity: 'urgent',
        title: 'Nia Mokoena asked to swap',
        detail: 'CS101 tutorial, Thursday 14:00',
        at: new Date().toISOString(),
      },
    ];

    renderDashboard();

    expect(screen.getByText('Nia Mokoena asked to swap')).toBeInTheDocument();
    expect(screen.getByText('CS101 tutorial, Thursday 14:00')).toBeInTheDocument();
    expect(screen.getByText('just now')).toBeInTheDocument();
    // The item's action link comes from alertConfig's type mapping.
    expect(screen.getByRole('link', { name: 'Respond' })).toHaveAttribute('href', '/swaps');
  });

  test('surfaces feed failures with the hook retry wired to Try again', () => {
    alertsState.loadError = 'Could not load your dashboard items. Please try again later.';

    renderDashboard();

    expect(
      screen.getByText('Could not load your dashboard items. Please try again later.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(alertsState.refresh).toHaveBeenCalledTimes(1);
  });

  test('shows when the feed was last refreshed', () => {
    const refreshedAt = new Date('2026-10-11T09:05:00');
    alertsState.lastRefreshedAt = refreshedAt.toISOString();

    renderDashboard();

    const expected = `updated ${refreshedAt.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    expect(screen.getByText(/live/i).textContent).toContain(expected);
  });
});
