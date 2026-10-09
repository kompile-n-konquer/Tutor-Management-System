import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
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
}));
vi.mock('../../../utils/axiosInstance.js', () => ({
  default: { post: mockPost, get: mockGet },
}));
// Signup refreshes the auth context after the backend profile is created so the
// sidebar role is up to date — stub the hook instead of wiring the real provider.
vi.mock('../../../hooks/useAuth.js', () => ({
  default: () => ({ refreshRole: mockRefreshRole }),
}));

import Signup from './Signup.jsx';

const renderSignup = () =>
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/tutor-dashboard" element={<div>tutor-dashboard-page</div>} />
        <Route path="/volunteer" element={<div>volunteer-page</div>} />
      </Routes>
    </MemoryRouter>,
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

describe('Signup — Firebase account + backend profile creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('keeps the create-account button disabled until the form is complete', () => {
    renderSignup();

    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();

    fillSignupForm({ 'Email Address': 'lerato@wits.ac.za' });
    expect(screen.getByRole('button', { name: /create account/i })).not.toBeDisabled();
  });

  test('stays disabled while any required field is empty', () => {
    renderSignup();

    fillSignupForm({ 'Last Name': '' });
    expect(screen.getByRole('button', { name: /create account/i })).toBeDisabled();
  });

  test('creates the Firebase user and the backend profile, then navigates', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-42' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue({ role: 'tutor' });
    renderSignup();

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

  test('shows the mapped Firebase error and never calls the backend on failure', async () => {
    createUserWithEmailAndPassword.mockRejectedValue(
      new FirebaseError('auth/email-already-in-use', 'raw'),
    );
    renderSignup();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
  });

  test('keeps the user on the form when the backend profile creation fails', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-7' } });
    mockPost.mockResolvedValue({ status: 400 });
    renderSignup();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/users', expect.anything()));
    expect(mockRefreshRole).not.toHaveBeenCalled();
    expect(screen.queryByText('tutor-dashboard-page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  test('sends a profile without a role to the student home', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-8' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue(null);
    renderSignup();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('volunteer-page')).toBeInTheDocument();
  });

  test('maps an unknown role to the volunteer fallback route', async () => {
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-9' } });
    mockPost.mockResolvedValue({ status: 201 });
    mockRefreshRole.mockResolvedValue({ role: 'MYSTERY' });
    renderSignup();

    fillSignupForm();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText('volunteer-page')).toBeInTheDocument();
  });
});
