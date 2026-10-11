import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ThemeProvider from '../context/ThemeProvider.jsx';
import Placeholder from './Placeholder.jsx';

vi.mock('../../hooks/useAuth.js', () => ({
  default: () => ({ currentUser: { uid: 'u1' }, role: 'tutor', loading: false, signOut: vi.fn() }),
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
        <ThemeProvider>
          <Placeholder />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(
      screen.getByText(/hasn't been built yet — flagged in the backlog/i),
    ).toBeInTheDocument();
  });

  test('accepts a custom label through to the layout', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <Placeholder label="Unique Screen Label" />
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Unique Screen Label')).toBeInTheDocument();
    // The sidebar is rendered with the role from useAuth (mocked as tutor above)
    // — every staff role now shares the one unified Dashboard entry.
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
