import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Shared mutable auth state so each test can pick the signed-in role.
const authState = vi.hoisted(() => ({ currentUser: { role: 'organiser' }, loading: false }));
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('../../components/layout/AppLayout', () => ({
  // Layout chrome is irrelevant here — pass the page content straight through.
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => authState,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

import Settings from './Settings.jsx';
import ThemeProvider from '../context/ThemeProvider.jsx';

const renderSettings = () =>
  render(
    <ThemeProvider>
      <Settings />
    </ThemeProvider>,
  );

describe('Settings — per-user settings page', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    navigateMock.mockClear();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  test('shows the appearance card to organisers without the system configuration', () => {
    authState.currentUser = { role: 'organiser' };
    renderSettings();

    expect(
      screen.getByRole('heading', { name: /appearance & accessibility/i }),
    ).toBeInTheDocument();
    // System configuration moved to the organiser-only Configurations page.
    expect(
      screen.queryByRole('heading', { name: /max claimable hours/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /hourly rates by year of study/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /timesheet pdf template/i }),
    ).not.toBeInTheDocument();
  });

  test('tutors see the appearance card with no system-settings placeholder', () => {
    authState.currentUser = { role: 'tutor' };
    renderSettings();

    expect(
      screen.getByRole('heading', { name: /appearance & accessibility/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/system settings coming soon/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /max claimable hours/i }),
    ).not.toBeInTheDocument();
  });

  test('tutors can flip dark mode straight from the settings page', () => {
    authState.currentUser = { role: 'tutor' };
    renderSettings();

    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
