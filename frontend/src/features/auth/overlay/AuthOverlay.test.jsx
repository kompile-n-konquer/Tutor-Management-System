import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The overlay pulls in both auth forms, which reach for Firebase and axios at
// import time — keep those side effects out of the interaction tests.
vi.mock('../../../firebase/firebase.js', () => ({ auth: {} }));
vi.mock('../../../firebase/googleProvider.js', () => ({ default: {} }));
vi.mock('../../../utils/axiosInstance.js', () => ({ default: {} }));
vi.mock('../../../hooks/useAuth.js', () => ({ default: () => ({ refreshRole: vi.fn() }) }));

import AuthOverlayProvider from './AuthOverlayProvider.jsx';
import AuthOverlay from './AuthOverlay.jsx';
import { useAuthOverlay } from './AuthOverlayContext.js';

// Mounts trigger buttons next to the overlay so the tests can drive the real
// context API the landing CTAs use.
function Trigger() {
  const { openAuthOverlay, closeAuthOverlay } = useAuthOverlay();
  return (
    <div>
      <button type="button" onClick={() => openAuthOverlay('login')}>trigger-login</button>
      <button type="button" onClick={() => openAuthOverlay('signup')}>trigger-signup</button>
      <button type="button" onClick={closeAuthOverlay}>trigger-close</button>
    </div>
  );
}

const renderOverlay = () =>
  render(
    <AuthOverlayProvider>
      <MemoryRouter>
        <Trigger />
        <AuthOverlay />
      </MemoryRouter>
    </AuthOverlayProvider>,
  );

describe('AuthOverlay — sliding dual-form authentication modal', () => {
  test('does not render anything while closed', () => {
    renderOverlay();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('opens on the login state with the login form visible', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  test('opens on the signup state when requested', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-signup' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  test('switches between login and signup without closing', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByLabelText('First Name')).toBeInTheDocument();
    // The dialog stays mounted — no full modal reload between states.
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByLabelText(/email address/i)).toBeInTheDocument();
  });

  test('closes via the close button', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-signup' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close authentication overlay/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('closes via the Escape key', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('closes via a backdrop click but not a click inside the panel', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));
    const dialog = await screen.findByRole('dialog');

    // Clicks inside the dialog are stopped from bubbling to the backdrop.
    fireEvent.click(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The backdrop is the dialog's parent — clicking it dismisses the overlay.
    fireEvent.click(dialog.parentElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('offers a back-to-landing-page escape hatch on each form', async () => {
    renderOverlay();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-login' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    const backButtons = screen.getAllByRole('button', { name: /back to landing page/i });
    expect(backButtons.length).toBe(2);
  });
});
