import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPost } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', role: 'TUTOR' }, loading: false },
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

// Timesheets reads the signed-in user straight from AuthContext (named hook),
// while the page chrome reads the default useAuth hook — mock both.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
}));
vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, post: mockPost } }));
// The top bar's search fetches /courses on mount; keep it out of this suite.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import Timesheets from './Timesheets.jsx';

const makeTimesheet = (overrides = {}) => ({
  id: 1,
  name: 'Week 1 — CS101',
  status: 'DRAFT',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  entries: [{ duration: 4.5 }, { duration: 3 }],
  ...overrides,
});

const renderTimesheets = (role = 'TUTOR') => {
  authState.currentUser = role ? { uid: 'u1', role } : null;
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/timesheets']}>
        <Routes>
          <Route path="/timesheets" element={<Timesheets />} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/timesheets/:id" element={<div>edit-timesheet-page</div>} />
          <Route path="/timesheets/:id/details" element={<div>details-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('Timesheets — tutor and lecturer review table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', role: 'TUTOR' };
    authState.loading = false;
  });

  test('shows skeleton rows while the timesheets are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    const { container } = renderTimesheets();

    // Four pulse-animated placeholder rows stand in for the review table.
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
    expect(mockGet).toHaveBeenCalledWith('/timesheets');
  });

  test('renders nothing when nobody is signed in — the route guard redirects', () => {
    const { container } = renderTimesheets(null);

    // ProtectedRoute owns the redirect; the page itself stays inert.
    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('renders the tutors timesheets with totals and statuses', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [
        makeTimesheet(),
        makeTimesheet({ id: 2, name: 'Week 2 — CS101', status: 'SUBMITTED', entries: [] }),
      ],
    });

    renderTimesheets();

    expect(await screen.findByText('Week 1 — CS101')).toBeInTheDocument();
    expect(screen.getByText('Week 2 — CS101')).toBeInTheDocument();
    // Entries are summed for the Total Hours column.
    expect(screen.getByText('7.5')).toBeInTheDocument();
    expect(screen.getByText('DRAFT')).toBeInTheDocument();
    expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    // Drafts continue editing; submitted timesheets open read-only.
    expect(screen.getByRole('button', { name: /continue editing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^view$/i })).toBeInTheDocument();
    // Tutors can start a new timesheet from this page.
    expect(screen.getByRole('button', { name: /create timesheet/i })).toBeInTheDocument();
  });

  test('shows the empty state when the tutor has no timesheets yet', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });

    renderTimesheets();

    expect(
      await screen.findByText('No timesheets yet. Click "Create Timesheet" to start one.'),
    ).toBeInTheDocument();
  });

  test('lecturers review the pending timesheets with the tutor identity', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [
        makeTimesheet({
          id: 5,
          status: 'SUBMITTED',
          tutorName: 'Sarah Johnson',
          tutorEmail: 'sarah.johnson@wits.ac.za',
        }),
      ],
    });

    renderTimesheets('LECTURER');

    expect(await screen.findByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('sarah.johnson@wits.ac.za')).toBeInTheDocument();
    // Lecturers fetch the review queue, not their own timesheets.
    expect(mockGet).toHaveBeenCalledWith('/timesheets/pending-review');
    // ...and cannot create a timesheet of their own.
    expect(screen.queryByRole('button', { name: /create timesheet/i })).not.toBeInTheDocument();
  });

  test('creates a new timesheet and navigates to the editor', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });
    mockPost.mockResolvedValue({ status: 201, data: { id: 9 } });

    renderTimesheets();
    fireEvent.click(await screen.findByRole('button', { name: /create timesheet/i }));

    expect(await screen.findByText('edit-timesheet-page')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/timesheets');
  });

  test('non-editable timesheets open the read-only details view', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [makeTimesheet({ id: 3, status: 'APPROVED', entries: [] })],
    });

    renderTimesheets();
    fireEvent.click(await screen.findByRole('button', { name: /^view$/i }));

    expect(await screen.findByText('details-page')).toBeInTheDocument();
  });
});
