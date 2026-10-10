import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPost } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', id: 1, role: 'TUTOR' }, loading: false },
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

// NewCoverOffer reads the signed-in user straight from AuthContext (named
// hook), while the page chrome reads the default useAuth hook — mock both.
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

import NewCoverOffer from './NewCoverOffer.jsx';

// A /sessions/mine row — this tutor's own session ledger.
const makeSession = (overrides = {}) => ({
  id: 3,
  status: 'UNASSIGNED',
  date: '2026-10-05T00:00:00.000Z',
  excuseReason: 'Medical appointment',
  volunteerRequest: null,
  course: { courseCode: 'CS101', courseName: 'Intro to Programming' },
  courseSlot: { venue: 'Room 204', timeSlot: { startMinute: 600, endMinute: 690 } },
  ...overrides,
});

const makeCandidate = (overrides = {}) => ({
  userId: 2,
  name: 'Thabo Mokoena',
  email: 'thabo@example.com',
  eligible: true,
  reasons: [],
  ...overrides,
});

const stubGets = (sessions = [makeSession()], candidates = [makeCandidate()]) => {
  mockGet.mockImplementation((url) => {
    if (url === '/sessions/mine') return Promise.resolve({ status: 200, data: { sessions } });
    if (url === '/sessions/3/cover-candidates') {
      return Promise.resolve({
        status: 200,
        data: { session: { id: 3, course: { courseCode: 'CS101', courseName: 'Intro to Programming' } }, candidates },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderNewCoverOffer = ({ role = 'TUTOR', sessionId } = {}) => {
  authState.currentUser = role ? { uid: 'u1', id: 1, role } : null;
  const initial = sessionId ? `/cover/new?sessionId=${sessionId}` : '/cover/new';
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/cover/new" element={<NewCoverOffer />} />
          <Route path="/cover" element={<div>cover-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('NewCoverOffer — offer an excused session to one tutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', id: 1, role: 'TUTOR' };
    authState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows the loading state while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderNewCoverOffer();

    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/mine');
  });

  test('redirects to the login page when nobody is signed in', async () => {
    renderNewCoverOffer({ role: null });

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects non-tutors back to the home page', async () => {
    renderNewCoverOffer({ role: 'STUDENT' });

    expect(await screen.findByText('home-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('lists the excused sessions in the session select', async () => {
    stubGets([
      makeSession(),
      makeSession({ id: 4, course: { courseCode: 'CS305', courseName: 'Database Systems' } }),
    ]);

    renderNewCoverOffer();

    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue('Select a session…');
    expect(screen.getByRole('option', { name: /CS101/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /CS305/ })).toBeInTheDocument();
  });

  test('only offers sessions that still need cover', async () => {
    stubGets([
      makeSession({ id: 5, status: 'OFFERED', course: { courseCode: 'CS99', courseName: 'Retired Course' } }),
      makeSession(),
    ]);

    renderNewCoverOffer();

    await screen.findByRole('combobox');
    expect(screen.getByRole('option', { name: /CS101/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /CS99/ })).not.toBeInTheDocument();
  });

  test('preselects the session from the sessionId query parameter', async () => {
    stubGets();

    renderNewCoverOffer({ sessionId: '3' });

    // The preselected session skips the placeholder and loads its candidates.
    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue(/CS101/);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/sessions/3/cover-candidates'));
  });

  test('ignores a query parameter that does not match an open session', async () => {
    stubGets();

    renderNewCoverOffer({ sessionId: '999' });

    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue('Select a session…');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('explains the empty state when there is nothing to offer', async () => {
    stubGets([]);

    renderNewCoverOffer();

    expect(
      await screen.findByText(/You have no excused sessions waiting for cover/i),
    ).toBeInTheDocument();
  });

  test('shows the server message when the sessions load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/sessions/mine') {
        return Promise.resolve({ status: 500, data: { message: 'Database unavailable' } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderNewCoverOffer();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('loads the validated tutors once a session is chosen', async () => {
    stubGets();

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/sessions/3/cover-candidates');
  });

  test('flags blocked tutors with their constraint reasons', async () => {
    stubGets(
      [makeSession()],
      [
        makeCandidate({
          eligible: false,
          reasons: ['Their availability does not cover this slot', 'This would double-book them'],
        }),
      ],
    );

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Blocked by constraints')).toBeInTheDocument();
    expect(screen.getByText('Their availability does not cover this slot')).toBeInTheDocument();
    expect(screen.getByText('This would double-book them')).toBeInTheDocument();
    // Blocked tutors cannot be selected as the nominee.
    expect(screen.getByRole('radio')).toBeDisabled();
  });

  test('explains when nobody is allocated to the course', async () => {
    stubGets([makeSession()], []);

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(
      await screen.findByText(/No other tutors are allocated to CS101/i),
    ).toBeInTheDocument();
  });

  test('shows the server message when the candidates load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/sessions/mine') return Promise.resolve({ status: 200, data: { sessions: [makeSession()] } });
      if (url === '/sessions/3/cover-candidates') {
        return Promise.resolve({ status: 500, data: { message: 'Constraints check failed' } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Constraints check failed')).toBeInTheDocument();
  });

  test('keeps the send button disabled until a nominee is chosen', async () => {
    stubGets();

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    const send = await screen.findByRole('button', { name: /send cover offer/i });
    expect(send).toBeDisabled();

    fireEvent.click(await screen.findByRole('radio'));

    await waitFor(() => expect(send).toBeEnabled());
  });

  test('always shows the cancel button and returns to the cover page', async () => {
    stubGets();

    renderNewCoverOffer();

    // Cancel is visible before any session is picked — unlike the old swap form.
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancel);

    expect(await screen.findByText('cover-page')).toBeInTheDocument();
  });

  test('submits the directed offer and returns to the cover page', async () => {
    stubGets();
    mockPost.mockResolvedValue({ status: 201, data: { id: 5, status: 'OFFERED' } });

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send cover offer/i }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/sessions/3/cover-offer', { nomineeId: 2 }),
    );
    expect(await screen.findByText('cover-page')).toBeInTheDocument();
  });

  test('shows the server message when the offer is rejected', async () => {
    stubGets();
    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'This session already has a cover request in progress' },
    });

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send cover offer/i }));

    expect(
      await screen.findByText('This session already has a cover request in progress'),
    ).toBeInTheDocument();
    expect(screen.queryByText('cover-page')).not.toBeInTheDocument();
  });

  test('shows a generic message when a failed submission carries none', async () => {
    stubGets();
    mockPost.mockResolvedValue({ status: 500, data: {} });

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send cover offer/i }));

    expect(
      await screen.findByText('Could not send the cover offer. Please try again.'),
    ).toBeInTheDocument();
  });

  test('stays on the page when the submission request throws', async () => {
    stubGets();
    mockPost.mockRejectedValue(new Error('network down'));

    renderNewCoverOffer();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send cover offer/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: /send cover offer/i })).toBeInTheDocument();
  });
});
