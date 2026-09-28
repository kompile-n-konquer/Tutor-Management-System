import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

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
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: authState.currentUser, role: 'tutor', loading: authState.loading }),
}));

import Profile from './Profile.jsx';

const TIME_SLOTS = [
  { id: 1, startMinute: 0, endMinute: 45 }, // 00:00
  { id: 2, startMinute: 360, endMinute: 405 }, // 06:00
  { id: 3, startMinute: 720, endMinute: 765 }, // 12:00
  { id: 4, startMinute: 1080, endMinute: 1125 }, // 18:00
];

const USER_PROFILE = { firstName: 'Alex', lastName: 'Mercer', email: 'alex.mercer@wits.ac.za' };

// Profile loads two endpoints in parallel: /availability (the grid) and
// /users/:uid (personal info). Route the axios mock per URL so each test
// controls both responses independently.
const mockApi = ({
  slots = TIME_SLOTS,
  availability = [],
  lockedSlots = [],
  availabilityStatus = 200,
  profile = USER_PROFILE,
} = {}) =>
  mockGet.mockImplementation((url) => {
    if (url === '/availability') {
      return Promise.resolve(
        availabilityStatus === 200
          ? { status: 200, data: { timeSlots: slots, availability, lockedSlots } }
          : { status: availabilityStatus, data: {} },
      );
    }
    if (url === `/users/${authState.currentUser?.uid}`) {
      return Promise.resolve(profile ? { status: 200, data: profile } : { status: 404, data: {} });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });

const renderProfile = () =>
  render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<div>login-page</div>} />
          <Route path="/" element={<div>home-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
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

  test('loads the timetable, renders every slot and marks the available days', async () => {
    mockApi({
      availability: [
        { dayOfWeek: 0, timeSlotId: 3 },
        { dayOfWeek: 1, timeSlotId: 3 },
      ],
    });

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/availability');
    // The grid is the full timetable — every fetched slot row is visible.
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('06:00')).toBeInTheDocument();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('18:00')).toBeInTheDocument();
    // Monday and Tuesday of the midday slot are marked available.
    expect(screen.getAllByText('Available')).toHaveLength(2);
    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  test('marks slots locked by a submitted application', async () => {
    mockApi({
      availability: [{ dayOfWeek: 0, timeSlotId: 3 }],
      lockedSlots: [{ dayOfWeek: 1, timeSlotId: 3 }],
    });

    renderProfile();

    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  test('renders the page with an empty grid when the load returns a non-200 response', async () => {
    mockApi({ availabilityStatus: 500 });

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  test('renders the page with an empty grid when the availability request throws', async () => {
    mockGet.mockImplementation((url) =>
      url === '/availability'
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ status: 200, data: USER_PROFILE }),
    );

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.queryByText('Available')).not.toBeInTheDocument();
  });

  describe('delete account', () => {
    test('deletes the account, signs out and returns home on success', async () => {
      mockApi({ slots: [] });
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
      mockApi({ slots: [] });
      mockDelete.mockResolvedValue({ status: 400, data: {} });

      renderProfile();
      fireEvent.click(await screen.findByRole('button', { name: /delete account/i }));

      await waitFor(() => expect(mockDelete).toHaveBeenCalled());
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
    });

    test('does nothing when there is no Firebase user', async () => {
      mockAuth.currentUser = null;
      mockApi({ slots: [] });

      renderProfile();
      fireEvent.click(await screen.findByRole('button', { name: /delete account/i }));

      await waitFor(() => expect(mockGet).toHaveBeenCalled());
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });
});
