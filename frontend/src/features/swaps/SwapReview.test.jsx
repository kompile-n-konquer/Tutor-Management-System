import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { authState, mockGet, mockPost } = vi.hoisted(() => ({
  authState: { currentUser: { uid: 'u1', id: 1, role: 'ORGANISER' }, loading: false },
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

// SwapReview reads the signed-in user straight from AuthContext (named hook),
// while the page chrome reads the default useAuth hook — mock both.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'organiser', loading: false, signOut: vi.fn() }),
}));
vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, post: mockPost } }));
// The top bar's search fetches /courses on mount; keep it out of this suite.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

import SwapReview from './SwapReview.jsx';

const slot = { dayOfWeek: 0, startMinute: 600, endMinute: 690 }; // Mon 10:00-11:30

const makeSwap = (overrides = {}) => ({
  id: 1,
  status: 'ACCEPTED',
  reason: 'Clash with my timetable',
  rejectionReason: '',
  requestedAt: '2026-09-28T00:00:00.000Z',
  requester: { userId: 2, name: 'Thabo Mokoena', email: 'thabo@example.com' },
  recipient: { userId: 3, name: 'Lerato Dlamini', email: 'lerato@example.com' },
  offeredSession: {
    eventId: 10,
    courseCode: 'CS101',
    courseName: 'Intro to Programming',
    date: '2026-10-05T00:00:00.000Z',
    slots: [slot],
  },
  requestedSession: null,
  ...overrides,
});

const renderSwapReview = (role = 'ORGANISER') => {
  authState.currentUser = role ? { uid: 'u1', id: 1, role } : null;
  return render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/swap-review']}>
        <Routes>
          <Route path="/swap-review" element={<SwapReview />} />
          <Route path="/swaps" element={<div>swaps-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
};

describe('SwapReview — organiser approval of session swaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1', id: 1, role: 'ORGANISER' };
    authState.loading = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('shows the loading state while the swaps are fetched', () => {
    mockGet.mockReturnValue(new Promise(() => {})); // never settles

    renderSwapReview();

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0);
    expect(mockGet).toHaveBeenCalledWith('/swaps');
  });

  test('redirects to the login page when nobody is signed in', async () => {
    renderSwapReview(null);

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects tutors to their swaps page', async () => {
    renderSwapReview('TUTOR');

    expect(await screen.findByText('swaps-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects students to the home page', async () => {
    renderSwapReview('STUDENT');

    expect(await screen.findByText('home-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('lists agreed swaps with approve and reject actions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });

    renderSwapReview();

    // The course code and name render as separate spans inside the row.
    expect(await screen.findByText('CS101')).toBeInTheDocument();
    expect(screen.getByText(/Intro to Programming/)).toBeInTheDocument();
    // The tutor names share a cell with the gives/receives labels.
    expect(screen.getByText(/Thabo Mokoena/)).toBeInTheDocument();
    expect(screen.getByText('gives')).toBeInTheDocument();
    expect(screen.getByText(/Lerato Dlamini/)).toBeInTheDocument();
    expect(screen.getByText('receives')).toBeInTheDocument();
    expect(screen.getByText('“Clash with my timetable”')).toBeInTheDocument();
    expect(screen.getByText('Awaiting organiser')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  test('marks two-way swaps with the return session', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [
        makeSwap({
          requestedSession: {
            eventId: 12,
            courseCode: 'CS305',
            courseName: 'Database Systems',
            date: '2026-10-06T00:00:00.000Z',
            slots: [slot],
          },
        }),
      ],
    });

    renderSwapReview();

    expect(await screen.findByText(/Two-way:/)).toBeInTheDocument();
    expect(screen.getByText(/CS305/)).toBeInTheDocument();
    expect(screen.queryByText('One-way handover')).not.toBeInTheDocument();
  });

  test('labels one-way handovers', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });

    renderSwapReview();

    expect(await screen.findByText('One-way handover')).toBeInTheDocument();
    expect(screen.queryByText(/Two-way:/)).not.toBeInTheDocument();
  });

  test('shows pending swaps without review actions', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap({ status: 'PENDING' })] });

    renderSwapReview();

    expect(await screen.findByText('Awaiting partner')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  test('collects decided swaps in the history table with their outcomes', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: [
        makeSwap({ id: 2, status: 'APPROVED' }),
        makeSwap({ id: 3, status: 'REJECTED', rejectionReason: 'Exceeds the weekly hour cap' }),
        makeSwap({ id: 4, status: 'CANCELLED', reason: '' }),
      ],
    });

    renderSwapReview();

    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Declined / rejected')).toBeInTheDocument();
    expect(screen.getByText('Exceeds the weekly hour cap')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  test('shows the empty states when there are no swaps at all', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [] });

    renderSwapReview();

    expect(
      await screen.findByText('No agreed swaps are waiting for organiser approval.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/No swap requests are waiting for a tutor's response/i)).toBeInTheDocument();
    expect(screen.getByText('No swap requests have been decided yet.')).toBeInTheDocument();
  });

  test('shows the server message when the load fails', async () => {
    mockGet.mockResolvedValue({ status: 500, data: { message: 'Database unavailable' } });

    renderSwapReview();

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
  });

  test('approves an agreed swap and reloads the tables', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 200, data: { id: 1, status: 'APPROVED' } });

    renderSwapReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/swaps/1/approve'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });

  test('rejects a swap with the prompted reason', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 200, data: { id: 1, status: 'REJECTED' } });
    vi.spyOn(window, 'prompt').mockReturnValue('Too many weekly hours');

    renderSwapReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/swaps/1/reject', { reason: 'Too many weekly hours' }),
    );
  });

  test('does nothing when the reject prompt is dismissed', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    vi.spyOn(window, 'prompt').mockReturnValue(null);

    renderSwapReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(mockPost).not.toHaveBeenCalled();
  });

  test('shows the constraint failures when an approval is rejected', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'The swap breaks the allocation constraints' },
    });

    renderSwapReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('The swap breaks the allocation constraints')).toBeInTheDocument();
  });

  test('shows a generic message when a failed review carries none', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    mockPost.mockResolvedValue({ status: 500, data: {} });

    renderSwapReview();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });

  test('renders nothing while the auth state is still loading', () => {
    authState.loading = true;

    const { container } = renderSwapReview();

    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('stays in the loading state when the swaps request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderSwapReview();

    // The hook swallows the throw and the loaded flag stays unset, so every
    // table keeps its loading placeholder and no error banner appears.
    expect(await screen.findAllByText('Loading...')).toHaveLength(3);
    expect(
      screen.queryByText('Something went wrong! Please try again later.'),
    ).not.toBeInTheDocument();
  });

  test('shows a generic message when a failed swap load carries none', async () => {
    mockGet.mockResolvedValue({ status: 500, data: {} });

    renderSwapReview();

    expect(
      await screen.findByText('Could not load swap requests. Please refresh the page.'),
    ).toBeInTheDocument();
  });

  test('surfaces the failure of a rejection, with message and fallback', async () => {
    mockGet.mockResolvedValue({ status: 200, data: [makeSwap()] });
    vi.spyOn(window, 'prompt').mockReturnValue('Not needed any more');

    renderSwapReview();

    mockPost.mockResolvedValue({
      status: 409,
      data: { message: 'The swap breaks the allocation constraints' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(
      await screen.findByText('The swap breaks the allocation constraints'),
    ).toBeInTheDocument();

    mockPost.mockResolvedValue({ status: 500, data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('That action failed. Please try again.')).toBeInTheDocument();
  });
});
