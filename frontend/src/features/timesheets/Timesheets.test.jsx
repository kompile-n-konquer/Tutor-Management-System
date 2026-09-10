import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Timesheets from './Timesheets.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));

describe('Timesheets — tutor weekly timesheet list', () => {
  test('renders the weekly log with its submit action and approval status', () => {
    render(
      <MemoryRouter>
        <Timesheets />
      </MemoryRouter>,
    );

    expect(screen.getByText('Weekly Timesheets')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit new log/i })).toBeInTheDocument();
    expect(screen.getByText('Week 12: Oct 10 - Oct 16')).toBeInTheDocument();
    expect(screen.getByText('Total Logged: 12.5 hrs')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
