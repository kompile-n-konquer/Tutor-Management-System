import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Placeholder from './Placeholder.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
}));
// The top bar's search fetches /courses through axios on mount; mock the API
// client with a never-settling promise so the Firebase import chain stays out
// of this suite and the late state update cannot fire outside act().
vi.mock('../../utils/axiosInstance.js', () => ({
  default: { get: vi.fn().mockReturnValue(new Promise(() => {})) },
}));

describe('Placeholder — unbuilt backlog screens', () => {
  test('renders the default label with the backlog note', () => {
    render(
      <MemoryRouter>
        <Placeholder />
      </MemoryRouter>,
    );

    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(
      screen.getByText(/hasn't been built yet — flagged in the backlog/i),
    ).toBeInTheDocument();
  });

  test('accepts a custom label and role through to the layout', () => {
    render(
      <MemoryRouter>
        <Placeholder role="organiser" label="Unique Screen Label" />
      </MemoryRouter>,
    );

    expect(screen.getByText('Unique Screen Label')).toBeInTheDocument();
    // The organiser rail is rendered for the given role — main's nav
    // reshuffle left that role with only the conflict-resolution button.
    expect(screen.getByText('Resolve Conflicts')).toBeInTheDocument();
    expect(screen.queryByText('Tutor Dashboard')).not.toBeInTheDocument();
  });
});
