import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';

const { mockGet, mockPut, authState, roleState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  authState: { currentUser: { uid: 'u1' }, loading: false },
  roleState: { value: 'tutor' },
}));

vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, put: mockPut } }));
vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: authState.currentUser, role: roleState.value, loading: authState.loading }),
}));

import EditTimetable from './EditTimetable.jsx';

const LOAD_DATA = {
  timeSlots: [{ id: 1, startMinute: 480, endMinute: 525 }],
  // slotId 99 does not exist — the loader must ignore that entry.
  availability: [{ dayOfWeek: 0, timeSlotId: 1 }, { dayOfWeek: 2, timeSlotId: 99 }],
};

// Session fixtures need dates that are always in the future, whatever the
// real clock says when the suite runs.
const futureDate = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const renderEditTimetable = () =>
  render(
    // The page chrome includes the theme toggle, so mount the real provider like the app does.
    <ThemeProvider>
      <MemoryRouter initialEntries={['/timetable/edit']}>
        <Routes>
          <Route path="/timetable/edit" element={<EditTimetable />} />
          <Route path="/profile" element={<div>profile-page</div>} />
          <Route path="/login" element={<div>login-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('EditTimetable — weekly availability editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1' };
    authState.loading = false;
    roleState.value = 'tutor';
  });

  test('renders nothing while the auth state is still loading', () => {
    authState.loading = true;
    authState.currentUser = null;

    const { container } = renderEditTimetable();

    expect(container).toBeEmptyDOMElement();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('redirects to the login page when nobody is signed in', async () => {
    authState.currentUser = null;

    renderEditTimetable();

    expect(await screen.findByText('login-page')).toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('shows a load error when the availability request returns a non-200 response', async () => {
    mockGet.mockResolvedValue({ status: 500, data: {} });

    renderEditTimetable();

    expect(
      await screen.findByText('Could not load your availability. Please try again.'),
    ).toBeInTheDocument();
  });

  test('shows a load error when the availability request throws', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    renderEditTimetable();

    expect(
      await screen.findByText('Could not load your availability. Please try again.'),
    ).toBeInTheDocument();
  });

  test('renders the loaded grid and toggles slots on click', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });

    const { container } = renderEditTimetable();

    expect(await screen.findByText('08:00-08:45')).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/availability');
    // The legend plus the Monday cell are marked available; slotId 99 is ignored.
    expect(screen.getAllByText('Available')).toHaveLength(2);

    // One row of five clickable day cells.
    const cells = container.querySelectorAll('.relative.cursor-pointer');
    expect(cells).toHaveLength(5);

    // Nothing has changed yet, so Save stays disabled.
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    expect(saveButton).toBeDisabled();

    // Clicking Tuesday toggles it on.
    fireEvent.click(cells[1]);
    expect(screen.getAllByText('Available')).toHaveLength(3);
    expect(saveButton).not.toBeDisabled();
  });

  test('saves the toggled availability and returns to the profile', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });
    mockPut.mockResolvedValue({ status: 200 });

    const { container } = renderEditTimetable();
    await screen.findByText('08:00-08:45');

    const cells = container.querySelectorAll('.relative.cursor-pointer');
    fireEvent.click(cells[1]); // Tuesday on

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/availability', {
        availability: [
          { dayOfWeek: 0, timeSlotId: 1 },
          { dayOfWeek: 1, timeSlotId: 1 },
        ],
      }),
    );
    expect(await screen.findByText('profile-page')).toBeInTheDocument();
  });

  test('saves an empty availability when a slot is toggled off', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });
    mockPut.mockResolvedValue({ status: 200 });

    const { container } = renderEditTimetable();
    await screen.findByText('08:00-08:45');

    const cells = container.querySelectorAll('.relative.cursor-pointer');
    fireEvent.click(cells[0]); // Monday off

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/availability', { availability: [] }),
    );
    expect(await screen.findByText('profile-page')).toBeInTheDocument();
  });

  test('shows the server message when the save is rejected', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });
    mockPut.mockResolvedValue({ status: 500, data: { message: 'Availability save failed' } });

    const { container } = renderEditTimetable();
    await screen.findByText('08:00-08:45');

    fireEvent.click(container.querySelectorAll('.relative.cursor-pointer')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Availability save failed')).toBeInTheDocument();
    expect(screen.queryByText('profile-page')).not.toBeInTheDocument();
  });

  test('shows a friendly error when the save request throws', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });
    mockPut.mockRejectedValue(new Error('network down'));

    const { container } = renderEditTimetable();
    await screen.findByText('08:00-08:45');

    fireEvent.click(container.querySelectorAll('.relative.cursor-pointer')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(
      await screen.findByText('Could not save your availability. Please try again.'),
    ).toBeInTheDocument();
  });

  test('cancelling returns to the profile without saving', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });

    renderEditTimetable();
    await screen.findByText('08:00-08:45');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('profile-page')).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('renders locked slots as read-only and keeps them in the saved payload', async () => {
    // Tuesday is locked by a submitted application; a lock on the unknown
    // slot 99 must be ignored.
    mockGet.mockImplementation((url) =>
      url === '/availability'
        ? Promise.resolve({
            status: 200,
            data: {
              timeSlots: [{ id: 1, startMinute: 480, endMinute: 525 }],
              availability: [{ dayOfWeek: 0, timeSlotId: 1 }],
              lockedSlots: [{ dayOfWeek: 1, timeSlotId: 1 }, { dayOfWeek: 2, timeSlotId: 99 }],
            },
          })
        : Promise.resolve({ status: 200, data: { sessions: [] } }),
    );
    mockPut.mockResolvedValue({ status: 200 });

    const { container } = renderEditTimetable();
    await screen.findByText('08:00-08:45');

    // The legend and the Tuesday cell both say Locked.
    expect(screen.getAllByText('Locked')).toHaveLength(2);
    // The locked cell is not clickable, so only four day cells respond.
    expect(container.querySelectorAll('.relative.cursor-pointer')).toHaveLength(4);

    // Free the Monday slot: the locked Tuesday stays in the payload because a
    // lock still means "available, but held by an application".
    fireEvent.click(container.querySelectorAll('.relative.cursor-pointer')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/availability', {
        availability: [{ dayOfWeek: 1, timeSlotId: 1 }],
      }),
    );
    expect(await screen.findByText('profile-page')).toBeInTheDocument();
  });

  test('lists an upcoming session with its excuse note for tutors', async () => {
    mockGet.mockImplementation((url) =>
      url === '/availability'
        ? Promise.resolve({ status: 200, data: LOAD_DATA })
        : Promise.resolve({
            status: 200,
            data: {
              sessions: [
                {
                  id: 'e1-excused',
                  status: 'UNASSIGNED',
                  date: futureDate(7),
                  excuseReason: 'Doctor visit',
                  course: { courseCode: 'COMS3005', courseName: 'Software Design' },
                  courseSlot: { venue: 'Room 204', timeSlot: { startMinute: 480, endMinute: 570 } },
                },
              ],
            },
          }),
    );

    renderEditTimetable();

    expect(await screen.findByText('Upcoming Sessions')).toBeInTheDocument();
    expect(screen.getByText('Your scheduled tutoring sessions.')).toBeInTheDocument();
    expect(screen.getByText('1 session')).toBeInTheDocument();
    expect(screen.getByText('Excused')).toBeInTheDocument();
    expect(screen.getByText('COMS3005')).toBeInTheDocument();
    expect(screen.getByText('Room 204')).toBeInTheDocument();
    expect(screen.getByText('“Doctor visit”')).toBeInTheDocument();
  });

  test('labels pending and scheduled sessions without optional details', async () => {
    mockGet.mockImplementation((url) =>
      url === '/availability'
        ? Promise.resolve({ status: 200, data: LOAD_DATA })
        : Promise.resolve({
            status: 200,
            data: {
              sessions: [
                {
                  id: 'e1-pending',
                  status: 'PENDING',
                  date: futureDate(8),
                  course: { courseName: 'Machine Learning' },
                  courseSlot: { timeSlot: { startMinute: 600, endMinute: 660 } },
                },
                {
                  id: 'e1-leading',
                  status: 'SCHEDULED',
                  date: futureDate(9),
                  course: { courseCode: 'COMS3008', courseName: 'Operating Systems' },
                },
              ],
            },
          }),
    );

    renderEditTimetable();

    expect(await screen.findByText('Upcoming Sessions')).toBeInTheDocument();
    expect(screen.getByText('2 sessions')).toBeInTheDocument();
    expect(screen.getByText('Volunteer pending')).toBeInTheDocument();
    expect(screen.getByText('You lead')).toBeInTheDocument();
    expect(screen.getByText('COMS3008')).toBeInTheDocument();
    // The pending session has no course code → em dash fallback.
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('students edit availability without the sessions section', async () => {
    roleState.value = 'student';
    mockGet.mockImplementation((url) =>
      url === '/availability'
        ? Promise.resolve({ status: 200, data: LOAD_DATA })
        : Promise.reject(new Error(`Unexpected GET ${url}`)),
    );

    renderEditTimetable();

    expect(await screen.findByText('08:00-08:45')).toBeInTheDocument();
    expect(screen.queryByText('Upcoming Sessions')).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalledWith('/sessions/mine');
  });

  test('returns to the previous page when the editor was opened in-app', async () => {
    mockGet.mockResolvedValue({ status: 200, data: LOAD_DATA });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/applications', '/timetable/edit']}>
          <Routes>
            <Route path="/timetable/edit" element={<EditTimetable />} />
            <Route path="/applications" element={<div>applications-page</div>} />
            <Route path="/profile" element={<div>profile-page</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );

    await screen.findByText('08:00-08:45');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('applications-page')).toBeInTheDocument();
  });
});
