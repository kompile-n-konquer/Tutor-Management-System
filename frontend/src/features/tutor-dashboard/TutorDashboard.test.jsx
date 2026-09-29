import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { mockGet, mockPatch, authState, firstVisitState, mockMarkSeen } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  authState: { userProfile: { firstName: 'Thabo' } },
  firstVisitState: { isFirstVisit: false },
  mockMarkSeen: vi.fn(),
}));

vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, patch: mockPatch },
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({
    currentUser: { uid: 'u1' },
    userProfile: authState.userProfile,
    role: 'tutor',
    loading: false,
    signOut: vi.fn(),
  }),
}));
// The walkthrough modal itself is excluded from this branch's coverage scope;
// stub the hook so tests control whether the dashboard shows it.
vi.mock('../../hooks/useFirstVisit.js', () => ({
  useFirstVisit: () => ({ isFirstVisit: firstVisitState.isFirstVisit, markSeen: mockMarkSeen }),
}));
// The layout's global search fetches (/applications or /courses) on mount,
// which would consume the per-call mock queues these tests rely on.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import TutorDashboard from './TutorDashboard.jsx';

// The ledger only shows sessions from today onwards, so fixtures anchor on
// tomorrow to stay date-independent.
const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

const makeSession = (overrides = {}) => ({
  id: 1,
  date: tomorrow(),
  status: 'SCHEDULED',
  isMine: true,
  excuseReason: null,
  course: { courseCode: 'CS101', courseName: 'Intro to Programming' },
  courseSlot: { venue: 'Lab 2', sessionType: 'Tutorial', timeSlot: { startMinute: 600, endMinute: 720 } },
  ...overrides,
});

// The /sessions/mine feed: the courses the tutor leads, their own session
// ledger, and the weekly-hours figures the dashboard cards are drawn from.
const makeFeed = (overrides = {}) => ({
  courses: [
    {
      assignmentId: 11,
      courseId: 100,
      courseCode: 'CS101',
      courseName: 'Intro to Programming',
      semester: '2026-S2',
      lecturerName: 'Sarah Van Wyk',
      allocatedHours: 3,
    },
  ],
  sessions: [makeSession()],
  maxHoursPerWeek: 10,
  weekScheduledHours: 2,
  ...overrides,
});

const renderDashboard = () =>
  render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter>
        <TutorDashboard />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('TutorDashboard — tutor sessions with the excuse flow (#37)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userProfile = { firstName: 'Thabo' };
    firstVisitState.isFirstVisit = false;
  });

  test('shows skeleton cards while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    const { container } = renderDashboard();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(mockGet).toHaveBeenCalledWith('/sessions/mine');
  });

  test('greets the tutor by profile name and offers the first-visit walkthrough', async () => {
    firstVisitState.isFirstVisit = true;
    mockGet.mockResolvedValue({ status: 200, data: makeFeed() });

    renderDashboard();

    expect(await screen.findByText("Thabo's tutoring schedule")).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  test('falls back to a generic heading when the profile has no name', async () => {
    authState.userProfile = null;
    mockGet.mockResolvedValue({ status: 200, data: makeFeed() });

    renderDashboard();

    expect(await screen.findByText('Your tutoring schedule')).toBeInTheDocument();
  });

  test("renders the course context, session ledger and this week's hours", async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({
        sessions: [
          makeSession(),
          makeSession({
            id: 2,
            status: 'UNASSIGNED',
            excuseReason: 'Medical appointment',
            course: { courseCode: 'CS305', courseName: 'Database Systems' },
          }),
          makeSession({
            id: 3,
            status: 'PENDING',
            courseSlot: { venue: null, sessionType: null, timeSlot: { startMinute: 600, endMinute: 720 } },
          }),
        ],
      }),
    });

    renderDashboard();

    expect(await screen.findByText("Thabo's tutoring schedule")).toBeInTheDocument();
    // Course context card: allocated hours and the lecturer.
    expect(screen.getByText('3 hrs allocated')).toBeInTheDocument();
    expect(screen.getByText('Lecturer: Sarah Van Wyk')).toBeInTheDocument();
    // The ledger: SCHEDULED rows lead, excused and pending rows carry their
    // chips, and the excuse reason is quoted back. The slot-less PENDING row
    // renders without its venue/session-type meta line.
    expect(screen.getByText('You lead')).toBeInTheDocument();
    expect(screen.getByText('Excused — awaiting volunteer')).toBeInTheDocument();
    expect(screen.getByText('Volunteer pending')).toBeInTheDocument();
    expect(screen.getByText('“Medical appointment”')).toBeInTheDocument();
    expect(screen.getByText('1 to lead · 3 total')).toBeInTheDocument();
    // This week's card draws the server-computed hours against the cap.
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('of 10h scheduled')).toBeInTheDocument();
  });

  test("drops sessions the API flags as not the tutor's own", async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({ sessions: [makeSession(), makeSession({ id: 2, isMine: false })] }),
    });

    renderDashboard();

    expect(await screen.findByText('You lead')).toBeInTheDocument();
    expect(screen.getByText('1 to lead · 1 total')).toBeInTheDocument();
  });

  test('only offers Excuse myself on SCHEDULED sessions', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({ sessions: [makeSession(), makeSession({ id: 2, status: 'UNASSIGNED' })] }),
    });

    renderDashboard();

    const excuseButtons = await screen.findAllByRole('button', { name: /excuse myself/i });
    expect(excuseButtons).toHaveLength(1);
  });

  test('shows the empty state when the tutor has no course assignments', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ courses: [], sessions: [] }) });

    renderDashboard();

    expect(await screen.findByText('No course assignments yet')).toBeInTheDocument();
  });

  test('explains the event-driven schedule when the tutor has courses but no sessions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ sessions: [] }) });

    renderDashboard();

    expect(await screen.findByText('No sessions scheduled yet for CS101.')).toBeInTheDocument();
    expect(screen.getByText(/Your lecturer posts events for your courses/i)).toBeInTheDocument();
  });

  test('links to volunteering when an excused session still needs cover', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({
        sessions: [makeSession({ status: 'UNASSIGNED', excuseReason: 'Sick' })],
      }),
    });

    renderDashboard();

    expect(
      await screen.findByText('You excused 1 session that still needs a volunteer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View volunteer opportunities' })).toHaveAttribute(
      'href',
      '/volunteer',
    );
  });

  test('shows the empty next-session note when nothing is left to lead', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({
        courses: [{ ...makeFeed().courses[0], lecturerName: null }],
        sessions: [makeSession({ status: 'UNASSIGNED' })],
      }),
    });

    renderDashboard();

    expect(await screen.findByText(/No sessions for you to lead right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lecturer:/)).not.toBeInTheDocument();
  });

  test('shows the server message on a non-200 load response', async () => {
    mockGet.mockResolvedValue({ status: 403, data: { message: 'Only tutors can view their assigned sessions' } });

    renderDashboard();

    expect(
      await screen.findByText('Only tutors can view their assigned sessions'),
    ).toBeInTheDocument();
  });

  test('shows a friendly error when the load request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderDashboard();

    expect(
      await screen.findByText('Could not load your sessions. Please try again later.'),
    ).toBeInTheDocument();
  });

  describe('excuse flow', () => {
    test('opens an inline reason form when Excuse Myself is clicked and cancels cleanly', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      renderDashboard();

      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));

      const reasonBox = screen.getByLabelText(/reason for excusing yourself/i);
      expect(reasonBox).toBeInTheDocument();
      // While the form is open the row's Excuse myself link is hidden.
      expect(screen.queryByRole('button', { name: /excuse myself/i })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByLabelText(/reason for excusing yourself/i)).not.toBeInTheDocument();
    });

    test('requires a reason before submitting', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      renderDashboard();

      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));
      // The textarea is required, so jsdom blocks a button click on the empty
      // field. Submitting the form directly bypasses constraint validation and
      // exercises the component's own empty-reason guard.
      fireEvent.submit(screen.getByLabelText(/reason for excusing yourself/i).closest('form'));

      expect(
        await screen.findByText('Please provide a reason for excusing yourself.'),
      ).toBeInTheDocument();
      expect(mockPatch).not.toHaveBeenCalled();
    });

    test('submits the trimmed reason and reloads the updated list', async () => {
      const excused = makeSession({ status: 'UNASSIGNED', excuseReason: 'Medical appointment' });
      mockGet.mockResolvedValueOnce({ status: 200, data: makeFeed() });
      mockGet.mockResolvedValueOnce({ status: 200, data: makeFeed({ sessions: [excused] }) });
      mockPatch.mockResolvedValue({ status: 200, data: excused });

      renderDashboard();
      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));

      fireEvent.change(screen.getByLabelText(/reason for excusing yourself/i), {
        target: { value: '  Medical appointment  ' },
      });
      fireEvent.click(screen.getByRole('button', { name: /confirm excuse/i }));

      await waitFor(() =>
        expect(mockPatch).toHaveBeenCalledWith('/sessions/1/excuse', {
          reason: 'Medical appointment',
        }),
      );
      // The excuse flips the session to UNASSIGNED, shown after the reload.
      expect(await screen.findByText('Excused — awaiting volunteer')).toBeInTheDocument();
      // The inline form is closed again after a successful excuse.
      expect(screen.queryByLabelText(/reason for excusing yourself/i)).not.toBeInTheDocument();
    });

    test('shows the server message when the excuse is rejected', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      mockPatch.mockResolvedValue({
        status: 409,
        data: { message: 'This session has already been excused or has a pending volunteer' },
      });

      renderDashboard();
      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));
      fireEvent.change(screen.getByLabelText(/reason for excusing yourself/i), {
        target: { value: 'Sick' },
      });
      fireEvent.click(screen.getByRole('button', { name: /confirm excuse/i }));

      expect(
        await screen.findByText(
          'This session has already been excused or has a pending volunteer',
        ),
      ).toBeInTheDocument();
    });

    test('shows a friendly error when the excuse request throws', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      mockPatch.mockRejectedValue(new Error('network down'));

      renderDashboard();
      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));
      fireEvent.change(screen.getByLabelText(/reason for excusing yourself/i), {
        target: { value: 'Sick' },
      });
      fireEvent.click(screen.getByRole('button', { name: /confirm excuse/i }));

      expect(
        await screen.findByText('Could not submit your excuse. Please try again later.'),
      ).toBeInTheDocument();
    });
  });
});
