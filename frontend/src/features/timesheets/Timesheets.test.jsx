import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Timesheets from './Timesheets.jsx';

vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
}));
// The top bar's search fetches /courses through axios on mount; keep that
// (and the Firebase import chain behind it) out of this suite.
vi.mock('../../components/search/GlobalSearch', () => ({
  default: () => null,
}));

describe('Timesheets — mock-data timesheet review table', () => {
  test('renders the seeded timesheets with their statuses', () => {
    render(
      <MemoryRouter>
        <Timesheets />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Timesheets' })).toBeInTheDocument();
    expect(screen.getByText('Alex Mercer')).toBeInTheDocument();
    // Two of the seeded rows are for CS101 (one pending, one approved).
    expect(screen.getAllByText('CS101').length).toBe(2);
    // Pending rows show the urgent badge, approved rows the trust badge.
    expect(screen.getAllByText('PENDING').length).toBe(3);
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  test('bulk-approves the selected pending timesheets', () => {
    render(
      <MemoryRouter>
        <Timesheets />
      </MemoryRouter>,
    );

    const approveButton = screen.getByRole('button', { name: /approve selected/i });
    expect(approveButton).toBeDisabled();

    // Select Alex's pending row, then approve it.
    const alexRow = screen.getByText('Alex Mercer').closest('tr');
    fireEvent.click(alexRow.querySelector('input[type="checkbox"]'));

    expect(approveButton).toBeEnabled();
    fireEvent.click(approveButton);

    // Alex's row moves from PENDING to APPROVED.
    expect(screen.getAllByText('PENDING').length).toBe(2);
    expect(screen.getAllByText('APPROVED').length).toBe(2);
  });
});
