import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));

vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, post: mockPost },
}));
vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));

import VolunteerView from './VolunteerView.jsx';

const makeSession = (overrides = {}) => ({
  id: 1,
  date: '2026-09-15T00:00:00.000Z',
  status: 'UNASSIGNED',
  assignment: { course: { courseCode: 'CS101', courseName: 'Intro to Programming' } },
  courseSlot: { timeSlot: { startMinute: 600, endMinute: 720 } },
  ...overrides,
});

const renderVolunteerView = () =>
  render(
    <MemoryRouter>
      <VolunteerView />
    </MemoryRouter>,
  );

describe('VolunteerView — student view of unassigned sessions (#37)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows a loading state while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderVolunteerView();

    expect(screen.getByText('Loading available sessions…')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/unassigned');
  });

  test('renders the unassigned sessions with course, duration and apply button', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [makeSession(), makeSession({ id: 2, assignment: { course: { courseCode: 'CS305', courseName: 'Database Systems' } } })],
    });

    renderVolunteerView();

    expect(await screen.findByText('CS101 — Intro to Programming')).toBeInTheDocument();
    expect(screen.getByText('CS305 — Database Systems')).toBeInTheDocument();
    expect(screen.getAllByText('2 Hours')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /apply to volunteer/i })).toHaveLength(2);
  });

  test('explains that volunteering is a request, not an instant assignment', () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });

    renderVolunteerView();

    expect(
      screen.getByText(/does not assign the session to you straight away/i),
    ).toBeInTheDocument();
  });

  test('falls back to a generic title when the session has no course info', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [makeSession({ assignment: null, courseSlot: { timeSlot: null } })],
    });

    renderVolunteerView();

    expect(await screen.findByText('Tutoring Session')).toBeInTheDocument();
    // No timeSlot means no duration badge.
    expect(screen.queryByText(/hours?/i)).not.toBeInTheDocument();
  });

  test('shows the empty state when no sessions need a volunteer', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });

    renderVolunteerView();

    expect(
      await screen.findByText('No sessions currently need a volunteer. Check back later.'),
    ).toBeInTheDocument();
  });

  test('shows the server message when the load fails with a non-200 response', async () => {
    mockGet.mockResolvedValue({ status: 500, data: { message: 'Database unavailable' } });

    renderVolunteerView();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('shows a friendly error when the load request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderVolunteerView();

    expect(
      await screen.findByText('Could not load volunteer opportunities. Please try again later.'),
    ).toBeInTheDocument();
  });

  test('removes the session from the list after a successful volunteer request', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [makeSession(), makeSession({ id: 2, assignment: { course: { courseCode: 'CS305', courseName: 'Database Systems' } } })],
    });
    mockPost.mockResolvedValue({ status: 201, data: { id: 9, status: 'PENDING' } });

    renderVolunteerView();
    const applyButtons = await screen.findAllByRole('button', { name: /apply to volunteer/i });

    fireEvent.click(applyButtons[0]);

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/sessions/1/volunteer'));
    // Session 1 is now PENDING and must disappear; session 2 stays.
    await waitFor(() => expect(screen.queryByText('CS101 — Intro to Programming')).not.toBeInTheDocument());
    expect(screen.getByText('CS305 — Database Systems')).toBeInTheDocument();
  });

  test('keeps the session and shows the server message when volunteering is rejected', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'Another student has already volunteered for this session' },
    });

    renderVolunteerView();
    fireEvent.click(await screen.findByRole('button', { name: /apply to volunteer/i }));

    expect(
      await screen.findByText('Another student has already volunteered for this session'),
    ).toBeInTheDocument();
    expect(screen.getByText('CS101 — Intro to Programming')).toBeInTheDocument();
  });

  test('shows a friendly error when the volunteer request throws', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSession()] });
    mockPost.mockRejectedValue(new Error('network down'));

    renderVolunteerView();
    fireEvent.click(await screen.findByRole('button', { name: /apply to volunteer/i }));

    expect(
      await screen.findByText('Could not submit your volunteer request. Please try again later.'),
    ).toBeInTheDocument();
  });
});
