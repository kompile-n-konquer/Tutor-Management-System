import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Shared mutable auth state so each test can pick the signed-in role.
const authState = vi.hoisted(() => ({ currentUser: { role: 'organiser' }, loading: false }));
const navigateMock = vi.hoisted(() => vi.fn());
const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));
// One stable object across renders — a fresh execute per render would change
// the settings effect's deps every time and loop loadSettings forever.
const useAsyncState = vi.hoisted(() => ({
  execute: vi.fn(async () => ({
    status: 200,
    data: {
      tutorMonthlyClaimableHours: 40,
      tutorEventClaimMonths: 3,
      hourlyRates: {},
      pdfTemplateFilename: null,
    },
  })),
  isLoading: false,
}));

vi.mock('../../components/layout/AppLayout', () => ({
  // Layout chrome is irrelevant here — pass the page content straight through.
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../../utils/axiosInstance', () => ({ default: apiMock }));
vi.mock('../../hooks/useAsync', () => ({
  default: () => useAsyncState,
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

describe('Settings — appearance card availability by role', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    navigateMock.mockClear();
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
  });

  test('organisers see the appearance card and the system settings cards', async () => {
    authState.currentUser = { role: 'organiser' };
    renderSettings();

    // Flush the async settings load so its state updates land inside act().
    await act(async () => {});

    expect(
      screen.getByRole('heading', { name: /appearance & accessibility/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /max claimable hours/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /hourly rates by year of study/i }),
    ).toBeInTheDocument();
  });

  test('tutors see the appearance card without the organiser-only settings', () => {
    authState.currentUser = { role: 'tutor' };
    renderSettings();

    expect(
      screen.getByRole('heading', { name: /appearance & accessibility/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /system settings coming soon/i }),
    ).toBeInTheDocument();
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
