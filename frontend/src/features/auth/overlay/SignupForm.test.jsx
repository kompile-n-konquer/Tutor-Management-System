import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createUserWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

const { mockAuth, mockPost, mockGet, mockRefreshRole } = vi.hoisted(() => ({
  mockAuth: { currentUser: null },
  mockPost: vi.fn(),
  mockGet: vi.fn(),
  mockRefreshRole: vi.fn(),
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
  createUserWithEmailAndPassword: vi.fn(),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: { type: 'LOCAL' },
  browserSessionPersistence: { type: 'SESSION' },
}));
vi.mock('../../../utils/axiosInstance.js', () => ({
  default: { post: mockPost, get: mockGet },
}));
// Signup refreshes the auth context after the backend profile is created so the
// sidebar role is up to date — stub the hook instead of wiring the real provider.
vi.mock('../../../hooks/useAuth.js', () => ({
  default: () => ({ refreshRole: mockRefreshRole }),
}));

import AuthOverlayProvider from './AuthOverlayProvider.jsx';
import SignupForm from './SignupForm.jsx';

const renderSignupForm = () =>
  render(
    <AuthOverlayProvider>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="*" element={<SignupForm />} />
          <Route path="/tutor-dashboard" element={<div>tutor-dashboard-page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthOverlayProvider>,
  );

const fillSignupForm = (overrides = {}) => {
  const values = {
    'First Name': 'Lerato',
    'Last Name': 'Mokoena',
    'Email Address': '  lerato@wits.ac.za  ',
    Password: 'password123',
    'Confirm Password': 'password123',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
};

describe('SignupForm — overlay Firebase account + backend profile creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The remember-device preference lives in localStorage — keep tests isolated.
    window.localStorage.clear();
  });

  test('keeps the create-account button disabled until the form is complete', () => {
    renderSignupForm();

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();

    fillSignupForm({ 'Email Address': 'lerato@wits.ac.za' });
    expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled();
  });

  test('stays disabled while any required field is empty', () => {
    renderSignupForm();

    fillSignupForm({ 'Last Name': '' });
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('creates the Firebase user and the backend profile, then navigates', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-42' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue({ role: 'tutor' });
    renderSignupForm();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    // The email is trimmed before it reaches Firebase or the backend.
    await waitFor(() =>
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
        mockAuth,
        'lerato@wits.ac.za',
        'password123',
      ),
    );
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/users', {
        firstName: 'Lerato',
        lastName: 'Mokoena',
        email: 'lerato@wits.ac.za',
        firebaseUid: 'uid-42',
      }),
    );
    // The refreshed role decides the landing page — tutor maps to /tutor-dashboard.
    expect(mockRefreshRole).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('tutor-dashboard-page')).toBeInTheDocument();
  });

  test('holds the overlay on a skeleton while the role is refreshed', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-42' } });
    mockPost.mockResolvedValue({ status: 201 });
    let resolveRefresh;
    mockRefreshRole.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    renderSignupForm();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    // The skeleton replaces the form while refreshRole is in flight, so the
    // landing page behind the overlay is never exposed mid-hand-off.
    expect(await screen.findByText('Preparing your dashboard…')).toBeInTheDocument();
    expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();

    resolveRefresh({ role: 'tutor' });
    expect(await screen.findByText('tutor-dashboard-page')).toBeInTheDocument();
  });

  test('shows the mapped Firebase error and never calls the backend on failure', async () => {
    createUserWithEmailAndPassword.mockRejectedValue(
      new FirebaseError('auth/email-already-in-use', 'raw'),
    );
    renderSignupForm();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
  });

  test('offers the login switch instead of navigating to /login', () => {
    renderSignupForm();

    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('checks Remember this Device by default and stores the device trust before creating the account', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-42' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue({ role: 'tutor' });
    renderSignupForm();

    expect(screen.getByRole('checkbox', { name: /remember this device/i })).toBeChecked();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(setPersistence).toHaveBeenCalledWith(mockAuth, browserLocalPersistence));
    // Persistence is pointed at the tier before the account is created.
    expect(setPersistence.mock.invocationCallOrder[0]).toBeLessThan(
      createUserWithEmailAndPassword.mock.invocationCallOrder[0],
    );
  });

  test('opting out of device trust persists the choice and uses session persistence', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-42' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue({ role: 'tutor' });
    renderSignupForm();

    fireEvent.click(screen.getByRole('checkbox', { name: /remember this device/i }));
    expect(window.localStorage.getItem('tutorflow-remember-device')).toBe('false');

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(setPersistence).toHaveBeenCalledWith(mockAuth, browserSessionPersistence));
  });
});
