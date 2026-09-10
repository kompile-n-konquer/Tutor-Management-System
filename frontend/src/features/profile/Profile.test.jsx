import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockAuth, authState, mockGet, mockDelete, mockSignOut } = vi.hoisted(() => ({
  mockAuth: { currentUser: { getIdToken: vi.fn(async () => 'token123') } },
  authState: { currentUser: { uid: 'u1' }, loading: false },
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
  mockSignOut: vi.fn(async () => {}),
}));

vi.mock('../../firebase/firebase', () => ({ auth: mockAuth }));
vi.mock('firebase/auth', () => ({ signOut: mockSignOut }));
vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, delete: mockDelete } }));
vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));

import Profile from './Profile.jsx';

const TIME_SLOTS = [
  { id: 1, startMinute: 0, endMinute: 45 }, // 00:00
  { id: 2, startMinute: 360, endMinute: 405 }, // 06:00
  { id: 3, startMinute: 720, endMinute: 765 }, // 12:00
  { id: 4, startMinute: 1080, endMinute: 1125 }, // 18:00
];

const renderProfile = () =>
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<div>login-page</div>} />
        <Route path="/" element={<div>home-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('Profile — tutor profile with the availability grid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1' };
    authState.loading = false;
    mockAuth.currentUser = { getIdToken: vi.fn(async () => 'token123') };
    // The grid is time-of-day dependent, so pin the clock for determinism.
    // shouldAdvanceTime keeps @testing-library's polling timers working.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-10T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders nothing while the auth state is still loading', () => {
    authState.loading = true;
    authState.currentUser = null;

    const { container } = renderProfile();

    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects to the login page when nobody is signed in', async () => {
    authState.currentUser = null;

    renderProfile();

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('loads the timetable and shows only the slots around the current hour', async () => {
    mockGet.mockResolvedValue({
      status: 200,
      data: {
        timeSlots: TIME_SLOTS,
        availability: [
          { dayOfWeek: 0, timeSlotId: 3 },
          { dayOfWeek: 1, timeSlotId: 3 },
        ],
      },
    });

    renderProfile();

    expect(await screen.findByText('12:00')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/availability');
    // At midday only the 12:00 slot is in view.
    expect(screen.queryByText('06:00')).not.toBeInTheDocument();
    expect(screen.queryByText('18:00')).not.toBeInTheDocument();
    // Monday and Tuesday of the midday slot are marked available.
    expect(screen.getAllByText('Available')).toHaveLength(2);
    // The rest of the profile renders alongside the grid.
    expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  test('falls back to the last three slots late in the evening', async () => {
    vi.setSystemTime(new Date('2026-09-10T23:30:00'));
    mockGet.mockResolvedValue({
      status: 200,
      data: { timeSlots: TIME_SLOTS, availability: [] },
    });

    renderProfile();

    expect(await screen.findByText('18:00')).toBeInTheDocument();
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    // The midnight slot is dropped by the slice(-3) fallback.
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });

  test('falls back to the first slots early in the morning', async () => {
    vi.setSystemTime(new Date('2026-09-10T00:15:00'));
    mockGet.mockResolvedValue({
      status: 200,
      data: {
        timeSlots: [TIME_SLOTS[2], TIME_SLOTS[3]],
        availability: [],
      },
    });

    renderProfile();

    expect(await screen.findByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
  });

  test('renders the page with an empty grid when the load returns a non-200 response', async () => {
    mockGet.mockResolvedValue({ status: 500, data: {} });

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  test('renders the page with an empty grid when the load request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  describe('delete account', () => {
    test('deletes the account, signs out and returns home on success', async () => {
      mockGet.mockResolvedValue({ status: 200, data: { timeSlots: [], availability: [] } });
      mockDelete.mockResolvedValue({ status: 204 });

      renderProfile();
      fireEvent.click(await screen.findByRole('button', { name: /delete account/i }));

      await waitFor(() =>
        expect(mockDelete).toHaveBeenCalledWith('/users', {
          headers: { Authorization: 'Bearer token123' },
        }),
      );
      expect(mockSignOut).toHaveBeenCalledWith(mockAuth);
      expect(await screen.findByText('home-page')).toBeInTheDocument();
    });

    test('keeps the user signed in when the delete is rejected', async () => {
      mockGet.mockResolvedValue({ status: 200, data: { timeSlots: [], availability: [] } });
      mockDelete.mockResolvedValue({ status: 400, data: {} });

      renderProfile();
      fireEvent.click(await screen.findByRole('button', { name: /delete account/i }));

      await waitFor(() => expect(mockDelete).toHaveBeenCalled());
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
    });

    test('does nothing when there is no Firebase user', async () => {
      mockAuth.currentUser = null;
      mockGet.mockResolvedValue({ status: 200, data: { timeSlots: [], availability: [] } });

      renderProfile();
      fireEvent.click(await screen.findByRole('button', { name: /delete account/i }));

      await waitFor(() => expect(mockGet).toHaveBeenCalled());
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });
});
