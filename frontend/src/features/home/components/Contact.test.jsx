import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// The overlay's SignupForm reads the auth context (provided globally in the
// app by RootLayout) — stub the hook for these Navbar-level tests.
vi.mock('../../auth/overlay/SignupForm.jsx', () => ({
  default: () => <div data-testid="signup-form-stub" />,
}));

import Contact from './Contact.jsx';
import Navbar from './Navbar.jsx';
import AuthOverlayProvider from '../../auth/overlay/AuthOverlayProvider.jsx';
import AuthOverlay from '../../auth/overlay/AuthOverlay.jsx';

describe('Contact', () => {
  test('submits a message and lets the visitor start another one', () => {
    render(<Contact />);

    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alan Turing' } });
    fireEvent.change(screen.getByLabelText('University Email'), { target: { value: 'alan@university.edu' } });
    fireEvent.change(screen.getByLabelText('User Category'), { target: { value: 'convenor' } });
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Question' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Please help.' } });
    fireEvent.submit(screen.getByRole('button', { name: /Send Message/ }).closest('form'));

    expect(screen.getByRole('status')).toHaveTextContent(/routed to CSAM Support/i);
    fireEvent.click(screen.getByRole('button', { name: 'Send another message' }));
    expect(screen.getByRole('button', { name: /Send Message/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Your Name')).toHaveValue('');
  });

  test('shows helpdesk contact options', () => {
    render(<Contact />);

    expect(screen.getByRole('link', { name: 'csam.help@university.edu' })).toHaveAttribute(
      'href',
      'mailto:csam.help@university.edu',
    );
    expect(screen.getByText('Mathematical Sciences Building, 3rd Floor')).toBeInTheDocument();
    expect(screen.getByText('Mon – Fri: 08:00 – 16:30')).toBeInTheDocument();
  });
});

describe('Navbar', () => {
  const renderNavbar = () =>
    render(
      <AuthOverlayProvider>
        <MemoryRouter>
          <Navbar />
          <AuthOverlay />
        </MemoryRouter>
      </AuthOverlayProvider>,
    );

  test('opens and closes the mobile navigation drawer', () => {
    renderNavbar();

    const menuButton = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(menuButton);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('link', { name: 'Benefits' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('link', { name: 'Benefits' })[1]);
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  test('opens the auth overlay in place from the single Log In CTA', () => {
    renderNavbar();

    // The navbar has exactly one call-to-action — Log In. Sign-up lives
    // inside the overlay, so there is no separate Enter Portal button.
    expect(screen.queryByRole('button', { name: /Enter Portal/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome Back' })).toBeInTheDocument();

    // Closing returns to the landing page, and the same CTA reopens the
    // overlay. (Two buttons match "Log In" once the form is mounted, so
    // target the navbar's.)
    fireEvent.click(screen.getByRole('button', { name: /close authentication overlay/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Log In' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
