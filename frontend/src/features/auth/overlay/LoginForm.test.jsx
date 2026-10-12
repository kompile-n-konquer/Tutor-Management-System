import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

const { mockAuth, mockProvider, mockGet } = vi.hoisted(() => ({
  mockAuth: { currentUser: null },
  mockProvider: { providerId: 'google.com' },
  mockGet: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  FirebaseError: class FakeFirebaseError extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
    }
  },
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: class {},
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
}));
vi.mock('../../../firebase/googleProvider.js', () => ({ default: mockProvider }));
vi.mock('../../../utils/axiosInstance.js', () => ({
  default: { get: mockGet },
}));

import AuthContext from '../../context/AuthContext.js';
import AuthOverlayProvider from './AuthOverlayProvider.jsx';
import LoginForm from './LoginForm.jsx';

const renderLoginForm = () =>
  render(
    <AuthOverlayProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="*" element={<LoginForm />} />
          <Route path="/dashboard" element={<div>dashboard-page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthOverlayProvider>,
  );

// Variant used by the trusted-device tests: a restored AuthProvider session
// makes the resume notice render above the form.
const renderLoginFormWithSession = (session) =>
  render(
    <AuthContext.Provider value={session}>
      <AuthOverlayProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="*" element={<LoginForm />} />
            <Route path="/dashboard" element={<div>dashboard-page</div>} />
          </Routes>
        </MemoryRouter>
      </AuthOverlayProvider>
    </AuthContext.Provider>,
  );

const submitLoginForm = (email, password) => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  // The password field has no associated label, so target it via its placeholder.
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /^log in/i }));
};

// Dispatches submit straight onto the form so jsdom's constraint validation
// (type=email) does not block tests that exercise the handler's own checks.
const submitLoginFormDirectly = (email, password) => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.submit(screen.getByPlaceholderText('••••••••').closest('form'));
};

describe('LoginForm — overlay email/password + Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The remember-device preference lives in localStorage — keep tests isolated.
    window.localStorage.clear();
  });

  test('renders the email, password and Google sign-in controls', () => {
    renderLoginForm();

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^log in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  test('rejects an invalid email before calling Firebase', async () => {
    renderLoginForm();

    submitLoginFormDirectly('not-an-email', 'password123');

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  test('signs in with Firebase and navigates to the unified dashboard', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginForm();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith(mockAuth, 'tutor@wits.ac.za', 'password123'));
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  test('holds the overlay on a skeleton while the profile role is resolved', async () => {
    let resolveProfile;
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    renderLoginForm();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    // The skeleton replaces the form while /users/me is in flight — the
    // landing page behind the overlay is never exposed.
    expect(await screen.findByText('Preparing your dashboard…')).toBeInTheDocument();
    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();

    resolveProfile({ status: 200, data: { role: 'tutor' } });
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  test('does not navigate away when the profile lookup fails', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 500, data: {} });
    renderLoginForm();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/users/me'));
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
    // The skeleton hands control back to the login form.
    expect(await screen.findByRole('button', { name: /^log in/i })).toBeInTheDocument();
    expect(screen.queryByText('Preparing your dashboard…')).not.toBeInTheDocument();
  });

  test('does not navigate away when the profile has no role', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: {} });
    renderLoginForm();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/users/me'));
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  test('routes an unknown role to the unified dashboard fallback', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'wizard' } });
    renderLoginForm();

    submitLoginForm('wizard@wits.ac.za', 'password123');

    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  test('shows the mapped Firebase error when the credentials are wrong', async () => {
    signInWithEmailAndPassword.mockRejectedValue(
      new FirebaseError('auth/invalid-credential', 'raw'),
    );
    renderLoginForm();

    submitLoginForm('tutor@wits.ac.za', 'wrong-password');

    expect(await screen.findByText('The email or password you entered is incorrect.')).toBeInTheDocument();
    expect(screen.queryByText('dashboard-page')).not.toBeInTheDocument();
  });

  test('signs in with Google via a popup when the Google button is clicked', async () => {
    signInWithPopup.mockResolvedValue({ user: { uid: 'user-2' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, mockProvider));
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
  });

  test('shows a friendly error when the Google popup is dismissed', async () => {
    signInWithPopup.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'raw'));
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(
      await screen.findByText('A network error occurred. Please check your internet connection.'),
    ).toBeInTheDocument();
  });

  test('links to the forgot-password page and offers the signup switch', () => {
    renderLoginForm();

    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
    // The Sign Up action now swaps the overlay panel instead of navigating.
    expect(screen.getByRole('button', { name: /sign up/i })).toBeInTheDocument();
  });

  test('checks Remember this Device by default and stores the device trust before signing in', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginForm();

    expect(screen.getByRole('checkbox', { name: /remember this device/i })).toBeChecked();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(setPersistence).toHaveBeenCalledWith(mockAuth, browserLocalPersistence));
    // Persistence is pointed at the tier before Firebase signs the user in.
    expect(setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithEmailAndPassword.mock.invocationCallOrder[0],
    );
  });

  test('opting out stores the preference and uses session persistence', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginForm();

    fireEvent.click(screen.getByRole('checkbox', { name: /remember this device/i }));
    expect(window.localStorage.getItem('tutorflow-remember-device')).toBe('false');

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(setPersistence).toHaveBeenCalledWith(mockAuth, browserSessionPersistence));
  });

  test('restores a previously saved remember-device preference', () => {
    window.localStorage.setItem('tutorflow-remember-device', 'false');
    renderLoginForm();

    expect(screen.getByRole('checkbox', { name: /remember this device/i })).not.toBeChecked();
  });

  test('applies the remember-device persistence to Google sign-in too', async () => {
    signInWithPopup.mockResolvedValue({ user: { uid: 'user-2' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginForm();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => expect(setPersistence).toHaveBeenCalledWith(mockAuth, browserLocalPersistence));
  });

  test('offers a one-click continue for a restored trusted-device session', async () => {
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLoginFormWithSession({
      currentUser: { email: 'tutor@wits.ac.za', role: 'tutor' },
      signOut: vi.fn(),
    });

    expect(screen.getByText(/already signed in/i)).toBeInTheDocument();
    expect(screen.getByText('tutor@wits.ac.za')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));

    // The bypass still re-resolves the role, then jumps straight to the dashboard.
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/users/me'));
    expect(await screen.findByText('dashboard-page')).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  test('sign out from the trusted-device notice clears the session', () => {
    const signOut = vi.fn();
    renderLoginFormWithSession({ currentUser: { email: 'tutor@wits.ac.za' }, signOut });

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
