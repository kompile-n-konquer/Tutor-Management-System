import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGet, mockPatch } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPatch: vi.fn() }));

vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, patch: mockPatch },
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
}));
// main's redesign added a first-visit onboarding modal and the global search
// (which fetches /courses on mount). Both are excluded from this branch's
// coverage scope; stub them so they cannot pollute the /sessions mock queues.
vi.mock('../../hooks/useFirstVisit.js', () => ({
  useFirstVisit: () => ({ isFirstVisit: false, markSeen: vi.fn() }),
}));
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import TutorDashboard from './TutorDashboard.jsx';

const makeSession = (overrides = {}) => ({
  id: 1,
  date: '2026-09-15T00:00:00.000Z',
  status: 'SCHEDULED',
  assignment: { course: { courseCode: 'CS101', courseName: 'Intro to Programming' } },
  courseSlot: { timeSlot: { startMinute: 600, endMinute: 720 } },
  ...overrides,
});

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <TutorDashboard />
    </MemoryRouter>,
  );

describe('TutorDashboard — tutor sessions with the excuse flow (#37)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows a loading row while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderDashboard();

    expect(screen.getByText('Loading your sessions…')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/mine');
  });

  test('renders each session with its status badge', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [
        makeSession(),
        makeSession({
          id: 2,
          status: 'UNASSIGNED',
          assignment: { course: { courseCode: 'CS305', courseName: 'Database Systems' } },
        }),
        makeSession({
          id: 3,
          status: 'PENDING',
          assignment: { course: { courseCode: 'MATH202', courseName: 'Linear Algebra' } },
        }),
      ],
    });

    renderDashboard();

    expect(await screen.findByText('CS101 — Intro to Programming')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Excused — awaiting volunteer')).toBeInTheDocument();
    expect(screen.getByText('Volunteer pending')).toBeInTheDocument();
  });

  test('only offers Excuse Myself on SCHEDULED sessions', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [makeSession(), makeSession({ id: 2, status: 'UNASSIGNED' })],
    });

    renderDashboard();

    const excuseButtons = await screen.findAllByRole('button', { name: /excuse myself/i });
    expect(excuseButtons).toHaveLength(1);
  });

  test('shows the empty state when the tutor has no sessions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });

    renderDashboard();

    expect(
      await screen.findByText('You have no assigned sessions yet.'),
    ).toBeInTheDocument();
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
      mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
      renderDashboard();

      fireEvent.click(await screen.findByRole('button', { name: /excuse myself/i }));

      const reasonBox = screen.getByLabelText(/reason for excusing yourself/i);
      expect(reasonBox).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByLabelText(/reason for excusing yourself/i)).not.toBeInTheDocument();
    });

    test('requires a reason before submitting', async () => {
      mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
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
      const scheduled = makeSession();
      const excused = makeSession({ status: 'UNASSIGNED', excuseReason: 'Medical appointment' });
      mockGet.mockResolvedValueOnce({ status: 200, data: [scheduled] });
      mockGet.mockResolvedValueOnce({ status: 200, data: [excused] });
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
      mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
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
      mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
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
