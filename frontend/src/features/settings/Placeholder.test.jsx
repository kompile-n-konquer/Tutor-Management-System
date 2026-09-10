import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Placeholder from './Placeholder.jsx';

vi.mock('../../features/context/AuthContext', () => ({
  useAuth: () => ({ currentUser: { uid: 'u1' }, loading: false, signOut: vi.fn() }),
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
    // The organiser sidebar is rendered for the given role.
    expect(screen.getByText('Allocation Board')).toBeInTheDocument();
  });
});
