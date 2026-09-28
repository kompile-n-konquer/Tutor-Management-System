import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
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
}));
vi.mock('../../../firebase/googleProvider.js', () => ({ default: mockProvider }));
vi.mock('../../../utils/axiosInstance.js', () => ({
  default: { get: mockGet },
}));

import Login from './Login.jsx';

const renderLogin = () =>
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/tutor-dashboard" element={<div>tutor-dashboard-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

const submitLoginForm = (email, password) => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  // The password field has no associated label, so target it via its placeholder.
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /log in/i }));
};

// Dispatches submit straight onto the form so jsdom's constraint validation
// (type=email) does not block tests that exercise the handler's own checks.
const submitLoginFormDirectly = (email, password) => {
  fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } });
  fireEvent.submit(screen.getByPlaceholderText('••••••••').closest('form'));
};

describe('Login — email/password + Google sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders the email, password and Google sign-in controls', () => {
    renderLogin();

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  test('rejects an invalid email before calling Firebase', async () => {
    renderLogin();

    submitLoginFormDirectly('not-an-email', 'password123');

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  test('signs in with Firebase and navigates to the tutor dashboard', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLogin();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith(mockAuth, 'tutor@wits.ac.za', 'password123'));
    expect(await screen.findByText('tutor-dashboard-page')).toBeInTheDocument();
  });

  test('does not navigate away when the profile lookup fails', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 500, data: {} });
    renderLogin();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/users/me'));
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
    // The login form is still on screen.
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('does not navigate away when the profile has no role', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: {} });
    renderLogin();

    submitLoginForm('tutor@wits.ac.za', 'password123');

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/users/me'));
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
  });

  test('routes an unknown role to the tutor dashboard fallback', async () => {
    signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'user-1' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'wizard' } });
    renderLogin();

    submitLoginForm('wizard@wits.ac.za', 'password123');

    expect(await screen.findByText('tutor-dashboard-page')).toBeInTheDocument();
  });

  test('shows the mapped Firebase error when the credentials are wrong', async () => {
    signInWithEmailAndPassword.mockRejectedValue(
      new FirebaseError('auth/invalid-credential', 'raw'),
    );
    renderLogin();

    submitLoginForm('tutor@wits.ac.za', 'wrong-password');

    expect(await screen.findByText('The email or password you entered is incorrect.')).toBeInTheDocument();
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
  });

  test('signs in with Google via a popup when the Google button is clicked', async () => {
    signInWithPopup.mockResolvedValue({ user: { uid: 'user-2' } });
    mockGet.mockResolvedValue({ status: 200, data: { role: 'tutor' } });
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    await waitFor(() => expect(signInWithPopup).toHaveBeenCalledWith(mockAuth, mockProvider));
    expect(await screen.findByText('tutor-dashboard-page')).toBeInTheDocument();
  });

  test('shows a friendly error when the Google popup is dismissed', async () => {
    signInWithPopup.mockRejectedValue(new FirebaseError('auth/network-request-failed', 'raw'));
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));

    expect(
      await screen.findByText('A network error occurred. Please check your internet connection.'),
    ).toBeInTheDocument();
  });

  test('links to the signup and forgot-password pages', () => {
    renderLogin();

    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: /sign up/i })).toHaveAttribute('href', '/signup');
  });
});
