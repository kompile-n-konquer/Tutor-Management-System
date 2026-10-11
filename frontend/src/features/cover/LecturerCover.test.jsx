import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPatch } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u9', id: 9, role: 'LECTURER' }, loading: false },
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
}));

// The hub reads the signed-in user straight from AuthContext (named hook),
// while the page chrome reads the default useAuth hook — mock both.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u9' }, role: 'lecturer', loading: false, signOut: vi.fn() }),
}));
vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, patch: mockPatch, delete: vi.fn() },
}));
// The top bar's search fetches /courses on mount; keep it out of this suite.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import Cover from './Cover.jsx';

// Run-relative dates keep the confirmed-covers window (upcoming only)
// meaningful whichever day the suite runs.
const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

// A /sessions/lecturer lifecycle row — the lecturer feed nests these under
// each course without course identity, so the hub flattens it on.
const makeSession = (overrides = {}) => ({
  id: 1,
  date: inDays(3),
  status: 'PENDING',
  excuseReason: 'I have a gig',
  tutorName: 'Nduvho Mulaudzi',
  volunteerRequest: { id: 5, status: 'PENDING', userId: 8, volunteerName: 'Priya Nair' },
  courseSlot: { venue: 'Lab 2', timeSlot: { startMinute: 540, endMinute: 600 } },
  ...overrides,
});

const makeCourse = (sessions) => ({
  id: 100,
  courseCode: 'COMS3055',
  courseName: 'Database Systems',
  tutors: [],
  events: [],
  sessions,
});

const stubLecturer = (courses) => {
  mockGet.mockImplementation((url) => {
    if (url === '/sessions/lecturer') {
      return Promise.resolve({ status: 200, data: { courses } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderHub = () =>
  render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/cover']}>
        <Routes>
          <Route path="/cover" element={<Cover />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('LecturerCover — the lecturer’s cross-course cover hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u9', id: 9, role: 'LECTURER' };
    authState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('groups every cover state into its own section', async () => {
    stubLecturer([
      makeCourse([
        makeSession(),
        makeSession({
          id: 2,
          status: 'OFFERED',
          volunteerRequest: { id: 6, status: 'OFFERED', userId: 7, volunteerName: 'Thabo Mokoena' },
        }),
        makeSession({ id: 3, status: 'UNASSIGNED', excuseReason: 'No reason', volunteerRequest: null }),
        makeSession({
          id: 4,
          status: 'SCHEDULED',
          excuseReason: 'Medical appointment',
          volunteerRequest: { id: 8, status: 'APPROVED', userId: 6, volunteerName: 'Lerato Dlamini' },
        }),
        // A past approved cover must not linger in the confirmed section.
        makeSession({
          id: 5,
          date: inDays(-2),
          status: 'SCHEDULED',
          volunteerRequest: { id: 9, status: 'APPROVED', userId: 6, volunteerName: 'Anele Past' },
        }),
      ]),
    ]);

    renderHub();

    // The lecturer feed is requested, the tutor feeds are not.
    expect(await screen.findByText('Cover requested by')).toBeInTheDocument();
    expect(screen.getByText('Priya Nair')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/lecturer');
    expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');

    // Nominee, volunteer and confirmed sections each carry their own row.
    expect(screen.getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('No reason')).toBeInTheDocument();
    expect(screen.getByText('Lerato Dlamini')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Anele Past')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nduvho Mulaudzi').length).toBeGreaterThan(0);

    expect(screen.getByRole('button', { name: 'Approve cover' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  test('approving a cover request sends APPROVED and refreshes the feed', async () => {
    stubLecturer([makeCourse([makeSession()])]);
    mockPatch.mockResolvedValue({ status: 200, data: { status: 'SCHEDULED' } });

    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve cover' }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/sessions/1/volunteer', { decision: 'APPROVED' }),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  test('rejecting a cover request sends REJECTED', async () => {
    stubLecturer([makeCourse([makeSession()])]);
    mockPatch.mockResolvedValue({ status: 200, data: { status: 'UNASSIGNED' } });

    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/sessions/1/volunteer', { decision: 'REJECTED' }),
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  test('falls back to a placeholder when the requester name is missing', async () => {
    stubLecturer([
      makeCourse([
        makeSession({
          volunteerRequest: { id: 5, status: 'PENDING', userId: 8, volunteerName: null },
        }),
      ]),
    ]);

    renderHub();

    expect(await screen.findByText('A tutor')).toBeInTheDocument();
  });

  test('shows the server message when a decision is rejected', async () => {
    stubLecturer([makeCourse([makeSession()])]);
    mockPatch.mockResolvedValue({
      status: 409,
      data: { message: 'This session has no volunteer request awaiting a decision' },
    });

    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve cover' }));

    expect(
      await screen.findByText('This session has no volunteer request awaiting a decision'),
    ).toBeInTheDocument();
  });

  test('shows a generic message when a failed decision carries none', async () => {
    stubLecturer([makeCourse([makeSession()])]);
    mockPatch.mockResolvedValue({ status: 500, data: {} });

    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(
      await screen.findByText('Could not update the cover request. Please try again later.'),
    ).toBeInTheDocument();
  });

  test('falls back to the generic message when the decision request throws', async () => {
    stubLecturer([makeCourse([makeSession()])]);
    mockPatch.mockRejectedValue(new Error('network down'));

    renderHub();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve cover' }));

    expect(
      await screen.findByText('Could not update the cover request. Please try again later.'),
    ).toBeInTheDocument();
  });

  test('shows the empty sections when there is no cover activity', async () => {
    stubLecturer([]);

    renderHub();

    expect(await screen.findByText('Nothing is waiting for your approval.')).toBeInTheDocument();
    expect(
      screen.getByText('No directed offers are waiting on a tutor’s response.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No sessions are waiting for a volunteer.')).toBeInTheDocument();
    expect(screen.getByText('No confirmed covers coming up.')).toBeInTheDocument();
  });

  test('shows the server message when the feed load fails', async () => {
    mockGet.mockResolvedValue({ status: 500, data: { message: 'Database unavailable' } });

    renderHub();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('shows a generic load error when the feed request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderHub();

    expect(
      await screen.findByText('Could not load the cover requests. Please refresh the page.'),
    ).toBeInTheDocument();
  });
});
