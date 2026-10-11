import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPatch, mockDelete } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', id: 1, role: 'TUTOR' }, loading: false },
  mockGet: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

// Cover reads the signed-in user straight from AuthContext (named hook),
// while the page chrome reads the default useAuth hook — mock both.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
}));
vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: mockGet, patch: mockPatch, delete: mockDelete },
}));
// The top bar's search fetches /courses on mount; keep it out of this suite.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import Cover from './Cover.jsx';

// A /sessions/mine row — this tutor's own session ledger.
const makeMineSession = (overrides = {}) => ({
  id: 10,
  date: '2026-10-05T00:00:00.000Z',
  status: 'UNASSIGNED',
  excuseReason: 'Medical appointment',
  volunteerRequest: null,
  course: { courseCode: 'CS101', courseName: 'Intro to Programming' },
  courseSlot: { venue: 'Room 204', timeSlot: { startMinute: 600, endMinute: 690 } },
  ...overrides,
});

// A /sessions/volunteered row — a session whose cover request belongs to
// this tutor (directed offer, volunteer request or accepted cover).
const makeVolunteered = (overrides = {}) => ({
  id: 21,
  date: '2026-10-06T00:00:00.000Z',
  status: 'OFFERED',
  volunteerStatus: 'OFFERED',
  course: { courseCode: 'CS305', courseName: 'Database Systems' },
  courseSlot: { venue: 'Room 108', timeSlot: { startMinute: 780, endMinute: 870 } },
  ledBy: 'Lerato Dlamini',
  ...overrides,
});

// The page loads /sessions/mine and /sessions/volunteered together; dispatch by URL.
const stubGets = ({ mine = [makeMineSession()], volunteered = [] } = {}) => {
  mockGet.mockImplementation((url) => {
    if (url === '/sessions/mine') return Promise.resolve({ status: 200, data: { sessions: mine } });
    if (url === '/sessions/volunteered') {
      return Promise.resolve({ status: 200, data: { sessions: volunteered } });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderCover = (role = 'TUTOR') => {
  authState.currentUser = role ? { uid: 'u1', id: 1, role } : null;
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/cover']}>
        <Routes>
          <Route path="/cover" element={<Cover />} />
          <Route path="/cover/new" element={<div>new-cover-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('Cover — directed cover-offer hub', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', id: 1, role: 'TUTOR' };
    authState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows the loading state while the cover data is fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderCover();

    expect(screen.getByText('Loading cover requests...')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/mine');
  });

  test('redirects to the login page when nobody is signed in', async () => {
    renderCover(null);

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects non-tutors back to the home page', async () => {
    renderCover('ORGANISER');

    expect(await screen.findByText('home-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('renders excused sessions with an offer-to-a-tutor link per row', async () => {
    stubGets({
      mine: [
        makeMineSession(),
        makeMineSession({
          id: 11,
          course: { courseCode: 'CS305', courseName: 'Database Systems' },
          excuseReason: null,
        }),
      ],
    });

    renderCover();

    // The course code and name render as separate spans inside the row.
    expect(await screen.findByText('CS101')).toBeInTheDocument();
    expect(screen.getByText(/Intro to Programming/)).toBeInTheDocument();
    expect(screen.getByText('CS305')).toBeInTheDocument();
    expect(screen.getByText(/Database Systems/)).toBeInTheDocument();
    expect(screen.getAllByText('Medical appointment')).toHaveLength(1);
    // A missing excuse reason renders as a dash.
    expect(screen.getByText('—')).toBeInTheDocument();

    const links = screen.getAllByRole('link', { name: 'Offer to a tutor' });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/cover/new?sessionId=10');
    expect(links[1].getAttribute('href')).toBe('/cover/new?sessionId=11');
  });

  test('only lists excused sessions as needing cover', async () => {
    stubGets({
      mine: [makeMineSession({ id: 30, status: 'SCHEDULED', course: { courseCode: 'CS401', courseName: 'Compilers' } })],
    });

    renderCover();

    expect(await screen.findByText('No excused sessions are waiting for cover.')).toBeInTheDocument();
    expect(screen.queryByText('CS401')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Offer to a tutor' })).not.toBeInTheDocument();
  });

  test('renders a directed offer waiting on the tutor with accept and decline', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });

    renderCover();

    expect(await screen.findByText('CS305')).toBeInTheDocument();
    expect(screen.getByText('Lerato Dlamini')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
  });

  test('accepts a directed offer and refreshes both feeds', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });
    mockPatch.mockResolvedValue({ status: 200, data: { decision: 'ACCEPT' } });

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/sessions/21/cover-offer', { decision: 'ACCEPT' }),
    );
    // Both feeds are reloaded after the action (two gets per load).
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
  });

  test('declines a directed offer with the DECLINE decision', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });
    mockPatch.mockResolvedValue({ status: 200, data: { decision: 'DECLINE' } });

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/sessions/21/cover-offer', { decision: 'DECLINE' }),
    );
  });

  test('shows the server message when a response action is rejected', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });
    mockPatch.mockResolvedValue({
      status: 409,
      data: { message: 'This session has no cover offer awaiting a response' },
    });

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(
      await screen.findByText('This session has no cover offer awaiting a response'),
    ).toBeInTheDocument();
  });

  test('shows a generic message when a failed response action carries none', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });
    mockPatch.mockResolvedValue({ status: 500, data: {} });

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });

  test('falls back to the generic message when the response request throws', async () => {
    stubGets({ mine: [], volunteered: [makeVolunteered()] });
    mockPatch.mockRejectedValue(new Error('network down'));

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });

  test('withdraws a sent cover offer and refreshes both feeds', async () => {
    stubGets({
      mine: [
        makeMineSession({
          id: 22,
          status: 'OFFERED',
          volunteerRequest: { status: 'OFFERED', userId: 2, tutorName: 'Thabo Mokoena' },
        }),
      ],
    });
    mockDelete.mockResolvedValue({ status: 200, data: { status: 'CANCELLED' } });

    renderCover();
    // The sent offer row carries the nominee and the waiting-on-nominee badge.
    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('Awaiting nominee')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/sessions/22/cover-offer'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
  });

  test('shows the server message when withdrawing a sent offer fails', async () => {
    stubGets({
      mine: [makeMineSession({ id: 22, status: 'OFFERED', volunteerRequest: { status: 'OFFERED', userId: 2, tutorName: 'Thabo Mokoena' } })],
    });
    mockDelete.mockResolvedValue({
      status: 409,
      data: { message: 'This session has no cover offer waiting for a response' },
    });

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));

    expect(
      await screen.findByText('This session has no cover offer waiting for a response'),
    ).toBeInTheDocument();
  });

  test('falls back to the generic message when the withdrawal request throws', async () => {
    stubGets({
      mine: [makeMineSession({ id: 22, status: 'OFFERED', volunteerRequest: { status: 'OFFERED', userId: 2, tutorName: 'Thabo Mokoena' } })],
    });
    mockDelete.mockRejectedValue(new Error('network down'));

    renderCover();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));

    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });

  test('lists everything awaiting the lecturer from both feeds', async () => {
    stubGets({
      mine: [
        makeMineSession({
          id: 40,
          status: 'PENDING',
          volunteerRequest: { status: 'PENDING', userId: 2, tutorName: 'Naledi Khumalo' },
        }),
      ],
      volunteered: [
        makeVolunteered({
          id: 41,
          status: 'PENDING',
          volunteerStatus: 'PENDING',
          course: { courseCode: 'CS201', courseName: 'Data Structures' },
        }),
      ],
    });

    renderCover();

    expect(await screen.findByText('Covered by Naledi Khumalo')).toBeInTheDocument();
    expect(screen.getByText('You are set to cover this session')).toBeInTheDocument();
    // One badge for the excuser's session, one for the volunteered cover.
    expect(screen.getAllByText('Awaiting lecturer')).toHaveLength(2);
  });

  test('falls back to a placeholder when a sent offer has no nominee name left', async () => {
    stubGets({
      mine: [
        makeMineSession({
          id: 22,
          status: 'OFFERED',
          volunteerRequest: { status: 'OFFERED', userId: 2, tutorName: null },
        }),
      ],
    });

    renderCover();

    expect(await screen.findByText('A tutor')).toBeInTheDocument();
  });

  test('keeps the excuser sections working when the volunteered feed fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/sessions/mine') return Promise.resolve({ status: 200, data: { sessions: [makeMineSession()] } });
      return Promise.resolve({ status: 500, data: { message: 'Volunteer service down' } });
    });

    renderCover();

    expect(await screen.findByText('CS101')).toBeInTheDocument();
    expect(screen.getByText('No cover offers are waiting on your response.')).toBeInTheDocument();
  });

  test('shows the server message when the sessions load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/sessions/mine') {
        return Promise.resolve({ status: 500, data: { message: 'Database unavailable' } });
      }
      return Promise.resolve({ status: 200, data: { sessions: [] } });
    });

    renderCover();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('shows a generic load error when both feeds throw', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderCover();

    expect(
      await screen.findByText('Could not load your cover requests. Please refresh the page.'),
    ).toBeInTheDocument();
  });

  test('shows the empty states when nothing needs cover', async () => {
    stubGets({ mine: [], volunteered: [] });

    renderCover();

    expect(
      await screen.findByText('No cover offers are waiting on your response.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No excused sessions are waiting for cover.')).toBeInTheDocument();
    expect(screen.getByText('You have not offered any sessions to anyone yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing is waiting on the lecturer right now.')).toBeInTheDocument();
    expect(screen.getByText(/No approved covers yet/)).toBeInTheDocument();
  });

  test('serves lecturers the cross-course cover hub on the same route', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/sessions/lecturer') {
        return Promise.resolve({ status: 200, data: { courses: [] } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderCover('LECTURER');

    // The lecturer hub renders and the tutor feeds are never requested.
    expect(await screen.findByText('Nothing is waiting for your approval.')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');
  });

  test('lists approved covers the tutor is confirmed to run', async () => {
    stubGets({
      mine: [],
      volunteered: [
        makeVolunteered({ id: 50, status: 'APPROVED', volunteerStatus: 'APPROVED' }),
      ],
    });

    renderCover();

    expect(await screen.findByText('CS305')).toBeInTheDocument();
    expect(screen.getByText('Lerato Dlamini')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
