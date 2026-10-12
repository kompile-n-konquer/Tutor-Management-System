import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
// stub the hook so tests control whether the section shows it.
vi.mock('../../hooks/useFirstVisit.js', () => ({
  useFirstVisit: () => ({ isFirstVisit: firstVisitState.isFirstVisit, markSeen: mockMarkSeen }),
}));

import TutorSchedule from './TutorSchedule.jsx';

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
// ledger, and the weekly-hours figures the cards are drawn from.
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

const renderSchedule = () =>
  render(
    // The section is embedded in the Dashboard's layout — only the /volunteer
    // link needs a router.
    <MemoryRouter>
      <TutorSchedule />
    </MemoryRouter>,
  );

describe('TutorSchedule — the tutor section of the unified Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.userProfile = { firstName: 'Thabo' };
    firstVisitState.isFirstVisit = false;
  });

  test('shows skeleton cards while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    const { container } = renderSchedule();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(2);
    expect(mockGet).toHaveBeenCalledWith('/sessions/mine');
  });

  test('offers the first-visit walkthrough without a page heading of its own', async () => {
    firstVisitState.isFirstVisit = true;
    mockGet.mockResolvedValue({ status: 200, data: makeFeed() });

    renderSchedule();

    expect(await screen.findByText('Step 1 of 4')).toBeInTheDocument();
    // Embedded mode: the Dashboard owns the header, so the section renders no
    // greeting of its own.
    expect(screen.queryByText(/tutoring schedule/i)).not.toBeInTheDocument();
  });

  test('renders the course context, session ledger and this week\'s hours', async () => {
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

    renderSchedule();

    // Course context card: allocated hours and the lecturer.
    expect(await screen.findByText('3 hrs allocated')).toBeInTheDocument();
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

  test('shows the hours alone when no weekly cap is on file', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({ maxHoursPerWeek: null }),
    });

    renderSchedule();

    // Without a cap there is no bar to draw — the card says so instead of
    // showing "of —h scheduled" beside an empty progress track.
    expect(await screen.findByText('2h')).toBeInTheDocument();
    expect(screen.getByText('scheduled this week')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('No weekly hour limit is on file for you yet.')).toBeInTheDocument();
  });

  test("drops sessions the API flags as not the tutor's own", async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({ sessions: [makeSession(), makeSession({ id: 2, isMine: false })] }),
    });

    renderSchedule();

    expect(await screen.findByText('You lead')).toBeInTheDocument();
    expect(screen.getByText('1 to lead · 1 total')).toBeInTheDocument();
  });

  test('only offers Excuse myself on SCHEDULED sessions', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({ sessions: [makeSession(), makeSession({ id: 2, status: 'UNASSIGNED' })] }),
    });

    renderSchedule();

    const excuseButtons = await screen.findAllByRole('button', { name: /excuse myself/i });
    expect(excuseButtons).toHaveLength(1);
  });

  test('shows the empty state when the tutor has no course assignments', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ courses: [], sessions: [] }) });

    renderSchedule();

    expect(await screen.findByText('No course assignments yet')).toBeInTheDocument();
  });

  test('explains the event-driven schedule when the tutor has courses but no sessions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ sessions: [] }) });

    renderSchedule();

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

    renderSchedule();

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

    renderSchedule();

    expect(await screen.findByText(/No sessions for you to lead right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/Lecturer:/)).not.toBeInTheDocument();
  });

  test('shows the server message on a non-200 load response', async () => {
    mockGet.mockResolvedValue({ status: 403, data: { message: 'Only tutors can view their assigned sessions' } });

    renderSchedule();

    expect(
      await screen.findByText('Only tutors can view their assigned sessions'),
    ).toBeInTheDocument();
  });

  test('retries the load when Try again is clicked', async () => {
    mockGet
      .mockResolvedValueOnce({ status: 500, data: {} })
      .mockResolvedValueOnce({ status: 200, data: makeFeed() });

    renderSchedule();

    fireEvent.click(await screen.findByRole('button', { name: /try again/i }));

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('You lead')).toBeInTheDocument();
  });

  test('shows a friendly error when the load request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderSchedule();

    expect(
      await screen.findByText('Could not load your sessions. Please try again later.'),
    ).toBeInTheDocument();
  });

  describe('excuse flow', () => {
    test('opens an inline reason form when Excuse Myself is clicked and cancels cleanly', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      renderSchedule();

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
      renderSchedule();

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

      renderSchedule();
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

      renderSchedule();
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

      renderSchedule();
      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));
      fireEvent.change(screen.getByLabelText(/reason for excusing yourself/i), {
        target: { value: 'Sick' },
      });
      fireEvent.click(screen.getByRole('button', { name: /confirm excuse/i }));

      expect(
        await screen.findByText('Could not submit your excuse. Please try again later.'),
      ).toBeInTheDocument();
    });

    test('shows a generic error when the excuse rejection carries no message', async () => {
      mockGet.mockResolvedValue({ status: 200, data: makeFeed() });
      mockPatch.mockResolvedValue({ status: 400, data: {} });

      renderSchedule();
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

  test('groups the ledger by day and filters out past sessions', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({
        courses: [
          makeFeed().courses[0],
          {
            ...makeFeed().courses[0],
            assignmentId: 12,
            courseCode: 'CS305',
            courseName: 'Database Systems',
          },
        ],
        sessions: [
          // Yesterday is behind us — it never reaches the ledger.
          makeSession({ date: new Date(Date.now() - 86400000).toISOString(), status: 'UNASSIGNED' }),
          makeSession({ id: 2, date: new Date().toISOString() }),
          makeSession({ id: 3, date: new Date(Date.now() + 3 * 86400000).toISOString() }),
        ],
      }),
    });

    renderSchedule();

    // Both future sessions lead — one chip each.
    expect(await screen.findAllByText('You lead')).toHaveLength(2);
    expect(screen.queryByText('Excused — awaiting volunteer')).not.toBeInTheDocument();
    // The ledger heading and the next-session panel share the same date
    // language, so "Today" may legitimately appear more than once.
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    const weekday = new Date(Date.now() + 3 * 86400000).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    // The ledger heading and the next-session panel share the same date language.
    expect(screen.getAllByText(weekday).length).toBeGreaterThan(0);
    expect(screen.getByText('CS305')).toBeInTheDocument(); // second assigned course
  });

  test('turns the weekly bar orange once the cap is exceeded', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ weekScheduledHours: 12 }) });

    renderSchedule();

    expect(await screen.findByText('12h')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Scheduled hours this week' })).toHaveClass(
      'bg-urgent-orange',
    );
  });

  test('drops the cap suffix and progress track when no weekly cap is configured', async () => {
    mockGet.mockResolvedValue({ status: 200, data: makeFeed({ maxHoursPerWeek: null }) });

    renderSchedule();

    expect(await screen.findByText('scheduled this week')).toBeInTheDocument();
    expect(screen.getByText('No weekly hour limit is on file for you yet.')).toBeInTheDocument();
    expect(
      screen.queryByRole('progressbar', { name: 'Scheduled hours this week' }),
    ).not.toBeInTheDocument();
  });

  test('summarises several cover sessions and tolerates a course-less row', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: makeFeed({
        sessions: [
          makeSession({ status: 'UNASSIGNED' }),
          makeSession({ id: 2, status: 'UNASSIGNED', course: null, excuseReason: 'Sick' }),
        ],
      }),
    });

    renderSchedule();

    expect(
      await screen.findByText('You excused 2 sessions that still need a volunteer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument(); // courseCode fallback
  });

  test('treats an empty 200 payload as no assignments', async () => {
    mockGet.mockResolvedValue({ status: 200 });

    renderSchedule();

    expect(await screen.findByText('No course assignments yet')).toBeInTheDocument();
  });
});
