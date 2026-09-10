import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));

import AllocationBoard from './AllocationBoard.jsx';

const renderBoard = () =>
  render(
    <MemoryRouter>
      <AllocationBoard />
    </MemoryRouter>,
  );

// The drop zone is the scrollable area that contains a given tutor card.
const poolZone = (tutorName) => screen.getByText(tutorName).closest('.overflow-y-auto');
const poolHeader = (label) => screen.getByText(label).closest('div');

describe('AllocationBoard — drag-and-drop tutor allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('lists the courses with their requirement badges', () => {
    renderBoard();

    expect(screen.getByText('CS101')).toBeInTheDocument();
    expect(screen.getByText('MATH202')).toBeInTheDocument();
    expect(screen.getByText('CS305')).toBeInTheDocument();
    expect(screen.getByText('Req: 5')).toBeInTheDocument();
    expect(screen.getByText('Req: 2')).toBeInTheDocument();
    expect(screen.getByText('Req: 4')).toBeInTheDocument();
  });

  test('shows both pools with their tutor counts and actions', () => {
    renderBoard();

    expect(screen.getByText('CS101 Allocation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /auto-assign/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();

    expect(screen.getByText('Available Tutors')).toBeInTheDocument();
    expect(screen.getByText('Assigned to CS101')).toBeInTheDocument();
    expect(within(poolHeader('Available Tutors')).getByText('2')).toBeInTheDocument();
    expect(within(poolHeader('Assigned to CS101')).getByText('1/5')).toBeInTheDocument();

    // Alex and Sarah are available; David is already assigned to CS101.
    expect(within(poolZone('David Kim')).queryByText('Alex Mercer')).not.toBeInTheDocument();
    expect(within(poolZone('Alex Mercer')).getByText('Sarah Jenkins')).toBeInTheDocument();
  });

  test('flags clashes, verification and low remaining hours on the tutor cards', () => {
    renderBoard();

    expect(screen.getByText('Schedule Clash')).toBeInTheDocument();
    expect(screen.getAllByText('Verified')).toHaveLength(2);
    expect(screen.getByText('15h left')).toBeInTheDocument();
    expect(screen.getByText('2h left')).toBeInTheDocument();
    expect(screen.getByText('8h left')).toBeInTheDocument();
    // The low-hours tutor is highlighted with the urgent colour.
    expect(screen.getByText('2h left').className).toContain('text-urgent-orange');
  });

  test('selecting another course updates the board header and counts', () => {
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: /CS305/i }));

    expect(screen.getByText('CS305 Allocation')).toBeInTheDocument();
    expect(screen.getByText('Assigned to CS305')).toBeInTheDocument();
    expect(within(poolHeader('Assigned to CS305')).getByText('1/4')).toBeInTheDocument();
  });

  test('moves an available tutor into the assigned pool on drop', () => {
    renderBoard();

    const availableZone = poolZone('Alex Mercer');
    const assignedZone = poolZone('David Kim');

    // Dragging over a pool highlights it as a drop target.
    fireEvent.dragOver(assignedZone, { dataTransfer: {} });
    expect(assignedZone.className).toContain('drag-over');

    fireEvent.drop(assignedZone, { dataTransfer: { getData: () => 't1' } });

    // The highlight clears and Alex has moved pools.
    expect(assignedZone.className).not.toContain('drag-over');
    expect(within(assignedZone).getByText('Alex Mercer')).toBeInTheDocument();
    expect(within(availableZone).queryByText('Alex Mercer')).not.toBeInTheDocument();
    expect(within(poolHeader('Available Tutors')).getByText('1')).toBeInTheDocument();
    expect(within(poolHeader('Assigned to CS101')).getByText('2/5')).toBeInTheDocument();
  });

  test('captures the dragged tutor id when a drag starts', () => {
    renderBoard();

    const setData = vi.fn();
    const alexCard = screen.getByText('Alex Mercer').closest('.cursor-grab');
    fireEvent.dragStart(alexCard, { dataTransfer: { setData } });

    expect(setData).toHaveBeenCalledWith('text/plain', 't1');
  });

  test('moves an assigned tutor back into the available pool', () => {
    renderBoard();

    const availableZone = poolZone('Alex Mercer');
    const assignedZone = poolZone('David Kim');

    fireEvent.drop(availableZone, { dataTransfer: { getData: () => 't3' } });

    expect(within(availableZone).getByText('David Kim')).toBeInTheDocument();
    expect(within(assignedZone).queryByText('David Kim')).not.toBeInTheDocument();
    expect(within(poolHeader('Available Tutors')).getByText('3')).toBeInTheDocument();
    expect(within(poolHeader('Assigned to CS101')).getByText('0/5')).toBeInTheDocument();
  });

  test('ignores drops that do not move a tutor between pools', () => {
    renderBoard();

    const availableZone = poolZone('Alex Mercer');
    const assignedZone = poolZone('David Kim');

    // Alex is already available; dropping him there changes nothing.
    fireEvent.drop(availableZone, { dataTransfer: { getData: () => 't1' } });
    expect(within(availableZone).getByText('Alex Mercer')).toBeInTheDocument();
    expect(within(assignedZone).queryByText('Alex Mercer')).not.toBeInTheDocument();

    // David is already assigned; dropping him there changes nothing either.
    fireEvent.drop(assignedZone, { dataTransfer: { getData: () => 't3' } });
    expect(within(assignedZone).getByText('David Kim')).toBeInTheDocument();
    expect(within(availableZone).queryByText('David Kim')).not.toBeInTheDocument();
  });
});
