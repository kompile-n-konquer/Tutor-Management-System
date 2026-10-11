import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPost } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', id: 1, role: 'TUTOR' }, loading: false },
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

// Swaps reads the signed-in user straight from AuthContext (named hook),
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

import Swaps from './Swaps.jsx';

const slot = { dayOfWeek: 0, startMinute: 600, endMinute: 690 }; // Mon 10:00-11:30

const makeSession = (overrides = {}) => ({
  eventId: 10,
  courseCode: 'CS101',
  courseName: 'Intro to Programming',
  date: '2026-10-05T00:00:00.000Z',
  slots: [slot],
  duration: 1.5,
  ...overrides,
});

const makeSwap = (overrides = {}) => ({
  id: 1,
  status: 'PENDING',
  reason: '',
  rejectionReason: '',
  requester: { userId: 2, name: 'Thabo Mokoena', email: 'thabo@example.com' },
  recipient: { userId: 1, name: 'Lerato Dlamini', email: 'lerato@example.com' },
  offeredSession: makeSession({ eventId: 10 }),
  requestedSession: null,
  ...overrides,
});

// The page loads /swaps/my-sessions and /swaps together; dispatch by URL.
const stubGets = ({ sessions = [makeSession()], swaps = [] } = {}) => {
  mockGet.mockImplementation((url) => {
    if (url === '/swaps/my-sessions') return Promise.resolve({ status: 200, data: sessions });
    if (url === '/swaps') return Promise.resolve({ status: 200, data: swaps });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const renderSwaps = (role = 'TUTOR') => {
  authState.currentUser = role ? { uid: 'u1', id: 1, role } : null;
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/swaps']}>
        <Routes>
          <Route path="/swaps" element={<Swaps />} />
          <Route path="/swaps/new" element={<div>new-swap-page</div>} />
          <Route path="/swap-review" element={<div>swap-review-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('Swaps — tutor session swap tables', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', id: 1, role: 'TUTOR' };
    authState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows the loading state while the swap data is fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderSwaps();

    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/swaps/my-sessions');
    expect(mockGet).toHaveBeenCalledWith('/swaps');
  });

  test('redirects to the login page when nobody is signed in', async () => {
    renderSwaps(null);

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects organisers to the swap review page', async () => {
    renderSwaps('ORGANISER');

    expect(await screen.findByText('swap-review-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects students back to the home page', async () => {
    renderSwaps('STUDENT');

    expect(await screen.findByText('home-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('renders claimed sessions with an offer-swap link per row', async () => {
    stubGets({
      sessions: [
        makeSession(),
        makeSession({ eventId: 11, courseCode: 'CS305', courseName: 'Database Systems' }),
      ],
    });

    renderSwaps();

    // The course code and name render as separate spans inside the row.
    expect(await screen.findByText('CS101')).toBeInTheDocument();
    expect(screen.getByText(/Intro to Programming/)).toBeInTheDocument();
    expect(screen.getByText('CS305')).toBeInTheDocument();
    expect(screen.getByText(/Database Systems/)).toBeInTheDocument();
    // Both sessions share the same weekly slot, so the label appears once per row.
    expect(screen.getAllByText('Mon 10:00-11:30')).toHaveLength(2);
    expect(screen.getAllByText('1.5 h')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Offer swap' })).toHaveLength(2);

    const link = screen.getAllByRole('link', { name: 'Offer swap' })[0];
    expect(link.getAttribute('href')).toBe('/swaps/new?eventId=10');
  });

  test('explains the empty state when the tutor has no claimed sessions', async () => {
    stubGets({ sessions: [] });

    renderSwaps();

    expect(
      await screen.findByText(/You have no claimed sessions available for swapping/i),
    ).toBeInTheDocument();
  });

  test('shows the server message when the sessions load fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/swaps/my-sessions') {
        return Promise.resolve({ status: 500, data: { message: 'Database unavailable' } });
      }
      return Promise.resolve({ status: 200, data: [] });
    });

    renderSwaps();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('shows received pending swaps with accept and decline actions', async () => {
    stubGets({ swaps: [makeSwap()] });

    renderSwaps();

    expect(await screen.findByText('Offered to you')).toBeInTheDocument();
    expect(screen.getByText('Thabo Mokoena')).toBeInTheDocument();
    expect(screen.getByText('thabo@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  test('shows sent pending swaps with a cancel action only', async () => {
    stubGets({
      swaps: [
        makeSwap({
          requester: { userId: 1, name: 'Lerato Dlamini', email: 'lerato@example.com' },
          recipient: { userId: 2, name: 'Thabo Mokoena', email: 'thabo@example.com' },
        }),
      ],
    });

    renderSwaps();

    expect(await screen.findByText('You offered this session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decline' })).not.toBeInTheDocument();
  });

  test('renders the return session, reason and rejection reason of decided swaps', async () => {
    stubGets({
      swaps: [
        makeSwap({
          status: 'REJECTED',
          reason: 'Clash with my timetable',
          rejectionReason: 'Too many weekly hours',
          requestedSession: makeSession({
            eventId: 12,
            courseCode: 'CS305',
            courseName: 'Database Systems',
          }),
        }),
      ],
    });

    renderSwaps();

    expect(await screen.findByText('Declined / rejected')).toBeInTheDocument();
    expect(screen.getByText(/In return:/)).toBeInTheDocument();
    expect(screen.getByText('“Clash with my timetable”')).toBeInTheDocument();
    expect(screen.getByText('Too many weekly hours')).toBeInTheDocument();
    // Decided swaps no longer offer any actions.
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  test('shows the empty states when there are no swap requests', async () => {
    stubGets();

    renderSwaps();

    expect(
      await screen.findByText('No swap requests have been offered to you.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/You have not requested any swaps yet/i)).toBeInTheDocument();
  });

  test('falls back to the empty swap tables when the swaps fetch fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/swaps/my-sessions') return Promise.resolve({ status: 200, data: [makeSession()] });
      return Promise.resolve({ status: 500, data: { message: 'Swap service down' } });
    });

    renderSwaps();

    expect(
      await screen.findByText('No swap requests have been offered to you.'),
    ).toBeInTheDocument();
  });

  test('accepts a received swap and refreshes both lists', async () => {
    stubGets({ swaps: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 200, data: { id: 1, status: 'ACCEPTED' } });

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/swaps/1/accept', undefined));
    // Both lists are reloaded after the action (two gets per load).
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(4));
  });

  test('declines a received swap with the prompted reason', async () => {
    stubGets({ swaps: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 200, data: { id: 1, status: 'REJECTED' } });
    vi.spyOn(window, 'prompt').mockReturnValue('I have a clash');

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/swaps/1/decline', { reason: 'I have a clash' }),
    );
  });

  test('does nothing when the decline prompt is dismissed', async () => {
    stubGets({ swaps: [makeSwap()] });
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('cancels a sent swap request', async () => {
    stubGets({
      swaps: [
        makeSwap({
          requester: { userId: 1, name: 'Lerato Dlamini', email: 'lerato@example.com' },
          recipient: { userId: 2, name: 'Thabo Mokoena', email: 'thabo@example.com' },
        }),
      ],
    });
    mockPost.mockResolvedValue({ status: 200, data: { id: 1, status: 'CANCELLED' } });

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/swaps/1/cancel', undefined));
  });

  test('shows the server message when an action is rejected', async () => {
    stubGets({ swaps: [makeSwap()] });
    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'This session was already swapped' },
    });

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('This session was already swapped')).toBeInTheDocument();
  });

  test('shows a generic message when a failed action carries none', async () => {
    stubGets({ swaps: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 500, data: {} });

    renderSwaps();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });

  test('renders nothing while the auth state is still loading', () => {
    authState.loading = true;

    const { container } = renderSwaps();

    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('shows a generic message when a failed sessions load carries none', async () => {
    mockGet.mockImplementation((url) =>
      url === '/swaps/my-sessions'
        ? Promise.resolve({ status: 500, data: {} })
        : Promise.resolve({ status: 200, data: [] }),
    );

    renderSwaps();

    expect(
      await screen.findByText('Could not load your sessions. Please refresh the page.'),
    ).toBeInTheDocument();
  });
});
