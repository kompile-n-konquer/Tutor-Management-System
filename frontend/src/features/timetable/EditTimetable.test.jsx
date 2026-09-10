import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const { mockGet, mockPut, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
  authState: { currentUser: { uid: 'u1' }, loading: false },
}));

vi.mock('../../utils/axiosInstance.js', () => ({ default: { get: mockGet, put: mockPut } }));
vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: authState.currentUser, loading: authState.loading }),
}));

import EditTimetable from './EditTimetable.jsx';

const LOAD_DATA = {
  timeSlots: [{ id: 1, startMinute: 480, endMinute: 525 }],
  // slotId 99 does not exist — the loader must ignore that entry.
  availability: [{ dayOfWeek: 0, timeSlotId: 1 }, { dayOfWeek: 2, timeSlotId: 99 }],
};

const renderEditTimetable = () =>
  render(
    <MemoryRouter initialEntries={['/timetable/edit']}>
      <Routes>
        <Route path="/timetable/edit" element={<EditTimetable />} />
        <Route path="/profile" element={<div>profile-page</div>} />
        <Route path="/login" element={<div>login-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('EditTimetable — weekly availability editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.currentUser = { uid: 'u1' };
    authState.loading = false;
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
});
