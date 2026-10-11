import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// Profile loads the endpoints its role needs: /availability (the grid) and
// the role's sessions feed for students/tutors, /sessions/lecturer for
// lecturers, /analytics/organiser for organisers/admins, plus /users/:uid
// (personal info). Route the axios mock per URL so each test controls every
// response independently.
const mockApi = ({
  slots = TIME_SLOTS,
  availability = [],
  lockedSlots = [],
  includeLockedSlots = true,
  availabilityStatus = 200,
  profile = USER_PROFILE,
  mineStatus = 200,
  mineSessions = [],
  volunteeredStatus = 200,
  volunteeredData = { sessions: [] },
  lecturerCourses = [],
  platformStats = null,
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
    if (url === '/sessions/mine') {
      return Promise.resolve({ status: mineStatus, data: { sessions: mineSessions } });
    }
    if (url === '/sessions/volunteered') {
      return Promise.resolve({ status: volunteeredStatus, data: volunteeredData });
    }
    if (url === '/sessions/lecturer') {
      return Promise.resolve({ status: 200, data: { courses: lecturerCourses } });
    }
    if (url === '/analytics/organiser') {
      return Promise.resolve({ status: 200, data: platformStats });
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

  describe('sessions section', () => {
    test('shows the generic User badge and no sessions section when the role is unknown', async () => {
      roleState.value = null;
      mockApi();

      renderProfile();

      expect(await screen.findByText('User')).toBeInTheDocument();
      expect(screen.queryByText('Scheduled Sessions')).not.toBeInTheDocument();
      expect(screen.queryByText('Volunteer Work')).not.toBeInTheDocument();
      // Roles without a sessions feed never touch either endpoint.
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/volunteered');
    });

    test('lists upcoming tutor sessions with one status chip per session', async () => {
      mockApi({
        mineSessions: [
          {
            id: 'e1-2026-09-15',
            status: 'UNASSIGNED',
            date: '2026-09-15',
            course: { courseCode: 'COMS3005', courseName: 'Software Design' },
            courseSlot: { venue: 'Room 204', timeSlot: { startMinute: 480, endMinute: 570 } },
          },
          {
            id: 'e1-2026-09-16',
            status: 'PENDING',
            date: '2026-09-16',
            course: { courseCode: 'COMS3007', courseName: 'Machine Learning' },
            courseSlot: { timeSlot: { startMinute: 600, endMinute: 660 } },
          },
          {
            id: 'e1-2026-09-17',
            status: 'SCHEDULED',
            date: '2026-09-17',
            course: { courseName: 'Operating Systems' },
          },
        ],
      });

      renderProfile();

      expect(await screen.findByText('Scheduled Sessions')).toBeInTheDocument();
      expect(screen.getByText('Your upcoming tutoring sessions.')).toBeInTheDocument();
      expect(screen.getByText('3 sessions')).toBeInTheDocument();
      // Excused (awaiting a volunteer), volunteer pending, and leading.
      expect(screen.getByText('Excused')).toBeInTheDocument();
      expect(screen.getByText('Volunteer pending')).toBeInTheDocument();
      expect(screen.getByText('You lead')).toBeInTheDocument();
      expect(screen.getByText('COMS3005')).toBeInTheDocument();
      expect(screen.getByText('Room 204')).toBeInTheDocument();
      // Em dashes: the phone, year-of-study, student-number and member-since
      // placeholders plus the missing course code on the third session.
      expect(screen.getAllByText('—')).toHaveLength(5);
    });

    test('hides the section when every session is in the past', async () => {
      mockApi({
        mineSessions: [
          {
            id: 'e1-2026-09-01',
            status: 'SCHEDULED',
            date: '2026-09-01',
            course: { courseCode: 'COMS3005', courseName: 'Software Design' },
          },
        ],
      });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Scheduled Sessions')).not.toBeInTheDocument();
    });

    test('ignores a non-200 tutor sessions feed', async () => {
      mockApi({ mineStatus: 500 });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Scheduled Sessions')).not.toBeInTheDocument();
    });

    test("lists a student's approved volunteered session", async () => {
      roleState.value = 'student';
      mockApi({
        volunteeredData: {
          sessions: [
            {
              id: 1,
              volunteerStatus: 'APPROVED',
              date: '2026-09-15',
              course: { courseCode: 'COMS3005', courseName: 'Software Design' },
              courseSlot: { venue: 'Room 204', timeSlot: { startMinute: 480, endMinute: 570 } },
            },
          ],
        },
      });

      renderProfile();

      expect(await screen.findByText('Volunteer Work')).toBeInTheDocument();
      expect(screen.getByText('Sessions you have volunteered for.')).toBeInTheDocument();
      expect(screen.getByText('1 session')).toBeInTheDocument();
      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(mockGet).toHaveBeenCalledWith('/sessions/volunteered');
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');
    });

    test('marks volunteered sessions that are not approved yet as pending', async () => {
      roleState.value = 'student';
      mockApi({
        volunteeredData: {
          sessions: [
            {
              id: 2,
              volunteerStatus: 'PENDING',
              date: '2026-09-16',
              course: { courseCode: 'COMS3007', courseName: 'Machine Learning' },
            },
          ],
        },
      });

      renderProfile();

      expect(await screen.findByText('Volunteer Work')).toBeInTheDocument();
      // The chip is a span — the only "Pending" on the page.
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    test('tolerates a volunteered feed without a sessions key', async () => {
      roleState.value = 'student';
      mockApi({ volunteeredData: {} });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Volunteer Work')).not.toBeInTheDocument();
    });

    test('ignores a non-200 volunteered feed', async () => {
      roleState.value = 'student';
      mockApi({ volunteeredStatus: 500, volunteeredData: {} });

      renderProfile();

      expect(await screen.findByText('Alex Mercer')).toBeInTheDocument();
      expect(screen.queryByText('Volunteer Work')).not.toBeInTheDocument();
    });
  });

  describe('role-specific panels', () => {
    test('a lecturer sees their own courses instead of the availability grid', async () => {
      roleState.value = 'lecturer';
      mockApi({
        profile: { ...USER_PROFILE, employeeNumber: '700123' },
        lecturerCourses: [
          {
            id: 1,
            courseCode: 'COMS3005',
            courseName: 'Software Design',
            tutors: [{ name: 'Alex Mercer' }, { name: 'Sam Lee' }],
            events: [{ id: 'e1', date: '2026-09-20' }],
            sessions: [
              { id: 's1', date: '2026-09-21', status: 'PENDING' },
              { id: 's2', date: '2026-09-15', status: 'SCHEDULED' },
            ],
          },
        ],
      });

      renderProfile();

      expect(await screen.findByText('My Courses')).toBeInTheDocument();
      expect(screen.getByText('COMS3005')).toBeInTheDocument();
      expect(screen.getByText('Software Design')).toBeInTheDocument();
      expect(screen.getByText('2 tutors')).toBeInTheDocument();
      expect(screen.getByText('1 upcoming event')).toBeInTheDocument();
      // PENDING future session → one open follow-up; SCHEDULED ones don't count.
      expect(screen.getByText('1 open follow-up')).toBeInTheDocument();
      // Staff identity: the employee number chip replaces any student number.
      expect(screen.getByText('Employee № 700123')).toBeInTheDocument();
      // Staff roles have no tutoring availability grid.
      expect(mockGet).toHaveBeenCalledWith('/sessions/lecturer');
      expect(mockGet).not.toHaveBeenCalledWith('/availability');
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');
      expect(screen.queryByText('Mon')).not.toBeInTheDocument();
    });

    test('a lecturer with no courses sees the empty state', async () => {
      roleState.value = 'lecturer';
      mockApi();

      renderProfile();

      expect(await screen.findByText(/You do not own any courses yet/)).toBeInTheDocument();
    });

    test('an organiser sees live platform aggregates instead of the availability grid', async () => {
      roleState.value = 'organiser';
      mockApi({
        profile: { ...USER_PROFILE, employeeNumber: '700124' },
        platformStats: {
          totals: { tutors: 12, lecturers: 5, students: 240, courses: 9, events: 88, upcomingEvents: 7 },
          timesheets: { signOffRate: 82 },
          applications: {
            role: { pending: 3, approved: 0, rejected: 0 },
            course: { pending: 4, assigned: 0, rejected: 0 },
          },
        },
      });

      renderProfile();

      expect(await screen.findByText('Platform Overview')).toBeInTheDocument();
      // The sidebar also renders a "Courses" link, so the stat tiles are
      // asserted inside the overview card rather than on the whole page.
      const overview = screen.getByText('Platform Overview').closest('.bg-surface-container-lowest');
      expect(within(overview).getByText('Courses')).toBeInTheDocument();
      expect(within(overview).getByText('9')).toBeInTheDocument();
      expect(within(overview).getByText('Upcoming events')).toBeInTheDocument();
      expect(within(overview).getByText('7')).toBeInTheDocument();
      expect(within(overview).getByText('Timesheet sign-off')).toBeInTheDocument();
      expect(within(overview).getByText('82%')).toBeInTheDocument();
      expect(within(overview).getByText('Role applications pending')).toBeInTheDocument();
      expect(within(overview).getByText('Course applications pending')).toBeInTheDocument();
      expect(mockGet).toHaveBeenCalledWith('/analytics/organiser');
      expect(mockGet).not.toHaveBeenCalledWith('/availability');
      expect(mockGet).not.toHaveBeenCalledWith('/sessions/lecturer');
      expect(screen.queryByText('Mon')).not.toBeInTheDocument();
    });

    test('an admin gets the same platform overview with system wording', async () => {
      roleState.value = 'admin';
      mockApi({
        platformStats: {
          totals: { tutors: 1, lecturers: 1, students: 1, courses: 1, events: 1, upcomingEvents: 1 },
          timesheets: { signOffRate: 0 },
          applications: {
            role: { pending: 0, approved: 0, rejected: 0 },
            course: { pending: 0, assigned: 0, rejected: 0 },
          },
        },
      });

      renderProfile();

      expect(await screen.findByText('Platform Overview')).toBeInTheDocument();
      expect(screen.getByText(/system database/)).toBeInTheDocument();
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
