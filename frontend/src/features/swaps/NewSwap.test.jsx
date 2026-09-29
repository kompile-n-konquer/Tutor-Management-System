import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPost } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', id: 1, role: 'TUTOR' }, loading: false },
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

// NewSwap reads the signed-in user straight from AuthContext (named hook),
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

import NewSwap from './NewSwap.jsx';

const slot = { dayOfWeek: 0, startMinute: 600, endMinute: 690 }; // Mon 10:00-11:30

const makeSession = (overrides = {}) => ({
  eventId: 3,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  date: '2026-10-05T00:00:00.000Z',
  slots: [slot],
  // Candidate sessions carry their own validation verdicts.
  eligible: true,
  reasons: [],
  ...overrides,
});

const makeCandidate = (overrides = {}) => ({
  userId: 2,
  name: 'Thabo Mokoena',
  eligible: true,
  reasons: [],
  sessions: [
    makeSession({ eventId: 20, courseCode: 'CS305', courseName: 'Database Systems' }),
  ],
  ...overrides,
});

const stubSessions = (sessions = [makeSession()], candidates = [makeCandidate()]) => {
  mockGet.mockImplementation((url) => {
    if (url === '/swaps/my-sessions') return Promise.resolve({ status: 200, data: sessions });
    if (url === '/swaps/candidates/3') {
      return Promise.resolve({
        status: 200,
        data: { session: { courseCode: 'CS101' }, candidates },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderNewSwap = ({ role = 'TUTOR', eventId } = {}) => {
  authState.currentUser = role ? { uid: 'u1', id: 1, role } : null;
  const initial = eventId ? `/swaps/new?eventId=${eventId}` : '/swaps/new';
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/swaps/new" element={<NewSwap />} />
          <Route path="/swaps" element={<div>swaps-page</div>} />
          <Route path="/swap-review" element={<div>swap-review-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('NewSwap — offer a session swap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', id: 1, role: 'TUTOR' };
    authState.loading = false;
  });

  test('shows the loading state while the sessions are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderNewSwap();

    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/swaps/my-sessions');
  });

  test('redirects to the login page when nobody is signed in', async () => {
    renderNewSwap({ role: null });

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects organisers to the swap review page', async () => {
    renderNewSwap({ role: 'ORGANISER' });

    expect(await screen.findByText('swap-review-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('lists the claimed sessions in the offered-session select', async () => {
    stubSessions([
      makeSession(),
      makeSession({ eventId: 4, courseCode: 'CS305', courseName: 'Database Systems' }),
    ]);

    renderNewSwap();

    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue('Select a session…');
    expect(screen.getByRole('option', { name: /CS101/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /CS305/ })).toBeInTheDocument();
  });

  test('preselects the session from the eventId query parameter', async () => {
    stubSessions();

    renderNewSwap({ eventId: '3' });

    // The preselected session skips the placeholder and loads its candidates.
    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue(/CS101/);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/swaps/candidates/3'));
  });

  test('ignores a query parameter that does not match a claimed session', async () => {
    stubSessions();

    renderNewSwap({ eventId: '999' });

    const select = await screen.findByRole('combobox');
    expect(select).toHaveDisplayValue('Select a session…');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('explains the empty state when there is nothing to offer', async () => {
    stubSessions([]);

    renderNewSwap();

    expect(await screen.findByText(/You have no claimed sessions to offer/i)).toBeInTheDocument();
  });

  test('shows the server message when the sessions load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/swaps/my-sessions') {
        return Promise.resolve({ status: 500, data: { message: 'Database unavailable' } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderNewSwap();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('loads the eligible partners once a session is chosen', async () => {
    stubSessions();

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('Eligible')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/swaps/candidates/3');
  });

  test('flags blocked partners with their constraint reasons', async () => {
    stubSessions([
      makeSession(),
    ], [
      makeCandidate({
        eligible: false,
        reasons: ['Exceeds the weekly hour cap', 'Clashes with their availability'],
      }),
    ]);

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Blocked by constraints')).toBeInTheDocument();
    expect(screen.getByText('Exceeds the weekly hour cap')).toBeInTheDocument();
    expect(screen.getByText('Clashes with their availability')).toBeInTheDocument();
  });

  test('explains when nobody is allocated to the course', async () => {
    stubSessions([makeSession()], []);

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(
      await screen.findByText(/No other tutors are allocated to CS101/i),
    ).toBeInTheDocument();
  });

  test('shows the server message when the candidates load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/swaps/my-sessions') return Promise.resolve({ status: 200, data: [makeSession()] });
      if (url === '/swaps/candidates/3') {
        return Promise.resolve({ status: 500, data: { message: 'Constraints check failed' } });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });

    expect(await screen.findByText('Constraints check failed')).toBeInTheDocument();
  });

  test('offers the partner sessions in return and an optional message', async () => {
    stubSessions();

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    expect(await screen.findByText(/Want one of Thabo/i)).toBeInTheDocument();
    expect(screen.getByText('No — they just take my session (one-way)')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /CS305/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send swap request/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  test('hides the return-session step when the partner has no sessions', async () => {
    stubSessions([makeSession()], [makeCandidate({ sessions: [] })]);

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    expect(await screen.findByRole('button', { name: /send swap request/i })).toBeInTheDocument();
    expect(screen.queryByText(/Want one of Thabo/i)).not.toBeInTheDocument();
  });

  test('warns when a blocked return session is picked', async () => {
    stubSessions(
      [makeSession()],
      [
        makeCandidate({
          sessions: [
            makeSession({
              eventId: 20,
              courseCode: 'CS305',
              eligible: false,
              reasons: ['Exceeds the weekly hour cap'],
            }),
          ],
        }),
      ],
    );

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    const returnSelect = await screen.findAllByRole('combobox');
    fireEvent.change(returnSelect[1], { target: { value: '20' } });

    expect(
      await screen.findByText(/This return session does not pass validation for you/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Exceeds the weekly hour cap/)).toBeInTheDocument();
  });

  test('submits the swap request and returns to the swaps page', async () => {
    stubSessions();
    mockPost.mockResolvedValue({ status: 201, data: { id: 5, status: 'PENDING' } });

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    const message = await screen.findByRole('textbox');
    fireEvent.change(message, { target: { value: 'Can you cover me?' } });

    fireEvent.click(screen.getByRole('button', { name: /send swap request/i }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/swaps', {
        recipientId: 2,
        requesterEventId: 3,
        recipientEventId: undefined,
        reason: 'Can you cover me?',
      }),
    );
    expect(await screen.findByText('swaps-page')).toBeInTheDocument();
  });

  test('includes the chosen return session in the payload', async () => {
    stubSessions();
    mockPost.mockResolvedValue({ status: 201, data: { id: 5, status: 'PENDING' } });

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    const returnSelect = await screen.findAllByRole('combobox');
    fireEvent.change(returnSelect[1], { target: { value: '20' } });

    fireEvent.click(screen.getByRole('button', { name: /send swap request/i }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/swaps', {
        recipientId: 2,
        requesterEventId: 3,
        recipientEventId: 20,
        reason: '',
      }),
    );
    expect(await screen.findByText('swaps-page')).toBeInTheDocument();
  });

  test('shows the server message when the swap is rejected', async () => {
    stubSessions();
    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'You are not allocated to this session' },
    });

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send swap request/i }));

    expect(await screen.findByText('You are not allocated to this session')).toBeInTheDocument();
    expect(screen.queryByText('swaps-page')).not.toBeInTheDocument();
  });

  test('shows a generic message when a failed submission carries none', async () => {
    stubSessions();
    mockPost.mockResolvedValue({ status: 500, data: {} });

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send swap request/i }));

    expect(
      await screen.findByText('Could not create the swap request. Please try again.'),
    ).toBeInTheDocument();
  });

  test('stays on the page when the submission request throws', async () => {
    stubSessions();
    mockPost.mockRejectedValue(new Error('network down'));

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: /send swap request/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /send swap request/i })).toBeInTheDocument();
  });

  test('the cancel button returns to the swaps page', async () => {
    stubSessions();

    renderNewSwap();
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '3' } });
    fireEvent.click(await screen.findByRole('radio'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('swaps-page')).toBeInTheDocument();
  });
});
