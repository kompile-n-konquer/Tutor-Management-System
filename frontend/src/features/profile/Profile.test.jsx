import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { mockAuth, authState, roleState, mockGet, mockDelete, mockSignOut } = vi.hoisted(() => ({
  mockAuth: { currentUser: { getIdToken: vi.fn(async () => 'token123') } },
  authState: { currentUser: { uid: 'u1' }, loading: false },
  roleState: { value: 'tutor' },
  mockGet: vi.fn(),
  mockDelete: vi.fn(),
  mockSignOut: vi.fn(async () => {}),
}));

vi.mock('../../firebase/firebase', () => ({ auth: mockAuth }));
vi.mock('firebase/auth', () => ({ signOut: mockSignOut }));
vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, delete: mockDelete } }));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: authState.currentUser, role: roleState.value, loading: authState.loading }),
}));

import Profile from './Profile.jsx';

const TIME_SLOTS = [
  { id: 1, startMinute: 0, endMinute: 45 }, // 00:00
  { id: 2, startMinute: 360, endMinute: 405 }, // 06:00
  { id: 3, startMinute: 720, endMinute: 765 }, // 12:00
  { id: 4, startMinute: 1080, endMinute: 1125 }, // 18:00
];

const USER_PROFILE = { firstName: 'Alex', lastName: 'Mercer', email: 'alex.mercer@wits.ac.za' };

// Profile loads three endpoints: /availability (the grid), /users/:uid
// (personal info) and /availability/timetable-pdf (the upload card's
// metadata, where 404 means nothing has been uploaded yet). Route the axios
// mock per URL so each test controls every response independently.
const mockApi = ({
  slots = TIME_SLOTS,
  availability = [],
  lockedSlots = [],
  includeLockedSlots = true,
  availabilityStatus = 200,
  profile = USER_PROFILE,
  timetablePdf = null,
} = {}) =>
  mockGet.mockImplementation((url) => {
    if (url === '/availability') {
      return Promise.resolve(
        availabilityStatus === 200
          ? {
              status: 200,
              data: {
                timeSlots: slots,
                availability,
                ...(includeLockedSlots ? { lockedSlots } : {}),
              },
            }
          : { status: availabilityStatus, data: {} },
      );
    }
    if (url === `/users/${authState.currentUser?.uid}`) {
      return Promise.resolve(profile ? { status: 200, data: profile } : { status: 404, data: {} });
    }
    if (url === '/availability/timetable-pdf') {
      return Promise.resolve(
        timetablePdf ? { status: 200, data: { timetablePdf } } : { status: 404, data: {} },
      );
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
          <Route path="/profile/edit" element={<div>profile-edit-page</div>} />
          <Route path="/timetable/edit" element={<div>timetable-edit-page</div>} />
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
    roleState.value = 'tutor';
    mockAuth.currentUser = { getIdToken: vi.fn(async () => 'token123') };
    // The grid is time-of-day dependent, so pin the clock for determinism.
    // shouldAdvanceTime keeps @testing-library's polling timers working.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-09-10T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('renders a loading skeleton while the auth state is still loading', () => {
    authState.loading = true;
    authState.currentUser = null;

    const { container } = renderProfile();

    // The page frame stays a skeleton — same treatment as every other
    // loading state in the app — and no data is fetched yet.
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('the pencil opens the profile editor', async () => {
    mockApi();

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Edit personal info'));
    expect(screen.getByText('profile-edit-page')).toBeInTheDocument();
  });

  test('the availability header opens the timetable editor', async () => {
    mockApi();

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Timetable' }));
    expect(screen.getByText('timetable-edit-page')).toBeInTheDocument();
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

  test('capitalises the year of study and shows the join date when provided', async () => {
    mockApi({
      profile: {
        firstName: 'Alex',
        lastName: 'Mercer',
        email: 'alex.mercer@wits.ac.za',
        yearOfStudy: 'third',
        createdAt: '2025-03-02T09:00:00Z',
      },
    });

    renderProfile();

    expect(await screen.findByText(/Third · Member since March 2025/)).toBeInTheDocument();
    // The info card shows the capitalised year on its own.
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  test('falls back to placeholders when the profile record is sparse', async () => {
    mockApi({ profile: { phoneNumber: '082 123 4567' } });

    renderProfile();

    expect(await screen.findByText('082 123 4567')).toBeInTheDocument();
    // Em dashes fill the rows the sparse record cannot answer.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument();
  });

  test('tolerates an availability payload without lockedSlots', async () => {
    mockApi({ includeLockedSlots: false });

    renderProfile();

    expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
  });

  test('shows the uploaded timetable PDF with its detected free slots', async () => {
    mockApi({
      timetablePdf: {
        originalName: 'my-timetable.pdf',
        sizeBytes: 204800,
        uploadedAt: '2026-10-01T10:00:00.000Z',
        extractedSlots: [
          { dayOfWeek: 0, timeSlotId: 3 },
          { dayOfWeek: 1, timeSlotId: 3 },
        ],
      },
    });

    renderProfile();

    // The 'Timetable PDF' header renders synchronously on mount, so waiting on
    // it says nothing about the metadata fetch — anchor on the filename, which
    // only appears once GET /availability/timetable-pdf has resolved.
    expect(await screen.findByText('my-timetable.pdf')).toBeInTheDocument();
    expect(screen.getByText('Timetable PDF')).toBeInTheDocument();
    expect(screen.getByText(/200 KB/)).toBeInTheDocument();
    expect(screen.getByText('Detected 2 free slots in this PDF.')).toBeInTheDocument();
    // With a PDF on file the upload label becomes a replace action.
    expect(screen.getByText('Replace Timetable')).toBeInTheDocument();
    // The profile has no grid to apply to — the card links to the editor
    // next to the availability header button.
    expect(screen.getAllByText('Edit Timetable')).toHaveLength(2);
  });

  test('falls back to a generic User badge when the role is unknown', async () => {
    roleState.value = null;
    mockApi();

    renderProfile();

    expect(await screen.findByText('User')).toBeInTheDocument();
  });

  describe('role-specific panels', () => {
    // The old lecturer-courses and platform-overview panels were removed —
    // staff roles get the plain profile with no availability grid.
    test('a lecturer gets the plain profile with no courses panel or availability grid', async () => {
      roleState.value = 'lecturer';
      mockApi({ profile: { ...USER_PROFILE, employeeNumber: '700123' } });

      renderProfile();

      // Staff identity: the employee number chip replaces any student number.
      expect(await screen.findByText('Employee № 700123')).toBeInTheDocument();
      expect(screen.queryByText('My Courses')).not.toBeInTheDocument();
      expect(screen.queryByText('Availability & Schedule')).not.toBeInTheDocument();
      expect(mockGet).not.toHaveBeenCalledWith('/availability');
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/lecturer');
    });

    test('an organiser gets no availability grid and no analytics panel', async () => {
      roleState.value = 'organiser';
      mockApi({ profile: { ...USER_PROFILE, employeeNumber: '700124' } });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Availability & Schedule')).not.toBeInTheDocument();
      expect(screen.queryByText('Platform Overview')).not.toBeInTheDocument();
      expect(mockGet).not.toHaveBeenCalledWith('/availability');
      expect(mockGet).not.toHaveBeenCalledWith('/analytics/organiser');
    });

    test('an admin gets the same plain profile as an organiser', async () => {
      roleState.value = 'admin';
      mockApi();

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Availability & Schedule')).not.toBeInTheDocument();
      expect(screen.queryByText('Platform Overview')).not.toBeInTheDocument();
      expect(mockGet).not.toHaveBeenCalledWith('/analytics/organiser');
    });

    test('hides the platform overview when the analytics request fails', async () => {
      roleState.value = 'organiser';
      mockGet.mockImplementation((url) => {
        if (url === '/analytics/organiser') return Promise.reject(new Error('network down'));
        if (url === `/users/${authState.currentUser?.uid}`) {
          return Promise.resolve({ status: 200, data: USER_PROFILE });
        }
        return Promise.reject(new Error(`Unexpected GET ${url}`));
      });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Platform Overview')).not.toBeInTheDocument();
    });
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
