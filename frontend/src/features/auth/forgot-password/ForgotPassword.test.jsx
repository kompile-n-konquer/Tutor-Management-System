import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';

const { mockAuth } = vi.hoisted(() => ({ mockAuth: { currentUser: null } }));

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
  sendPasswordResetEmail: vi.fn(),
}));

import ForgotPassword from './ForgotPassword.jsx';

const renderForgotPassword = () =>
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/confirmation-message" element={<div>confirmation-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ForgotPassword — password reset request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('disables the submit button until a valid email is entered', () => {
    renderForgotPassword();

    const submit = screen.getByRole('button', { name: /send reset link/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'not-an-email' },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: '  lerato@wits.ac.za  ' },
    });
    expect(submit).not.toBeDisabled();
  });

  test('sends the reset email (trimmed) and redirects to the confirmation page', async () => {
    sendPasswordResetEmail.mockResolvedValue(undefined);
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: '  lerato@wits.ac.za  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() =>
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(mockAuth, 'lerato@wits.ac.za'),
    );
    expect(await screen.findByText('confirmation-page')).toBeInTheDocument();
  });

  test('shows a friendly error when the reset email cannot be sent', async () => {
    sendPasswordResetEmail.mockRejectedValue(new FirebaseError('auth/user-not-found', 'raw'));
    renderForgotPassword();

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'ghost@wits.ac.za' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(
      await screen.findByText('No account was found with this email address.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('confirmation-page')).not.toBeInTheDocument();
  });

  test('links back to the login page', () => {
    renderForgotPassword();

    const backLinks = screen.getAllByRole('link', { name: /back to login|log in/i });
    expect(backLinks.length).toBeGreaterThan(0);
    expect(backLinks[0]).toHaveAttribute('href', '/login');
  });
});
