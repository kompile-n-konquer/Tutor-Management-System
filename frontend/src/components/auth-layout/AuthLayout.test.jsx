import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';

describe('AuthLayout — split-screen shell for the auth pages', () => {
  test('renders the heading, description, children and footer link', () => {
    render(
      <MemoryRouter>
        <AuthLayout
          heading="Welcome Back"
          description="Sign in to manage your scheduling."
          footerPrompt="Don't have an account? "
          footerLinkText="Sign Up"
          footerLinkTo="/signup"
        >
          <div>form-goes-here</div>
        </AuthLayout>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Welcome Back').length).toBeGreaterThan(0);
    expect(screen.getByText('Sign in to manage your scheduling.')).toBeInTheDocument();
    expect(screen.getByText('form-goes-here')).toBeInTheDocument();
    expect(screen.getByText("Don't have an account?")).toBeInTheDocument();

    const signUpLink = screen.getByRole('link', { name: /sign up/i });
    expect(signUpLink).toHaveAttribute('href', '/signup');
  });

  test('links back to the home page', () => {
    render(
      <MemoryRouter>
        <AuthLayout
          heading="Create an Account"
          description="Register to manage your scheduling."
          footerPrompt="Already have an account? "
          footerLinkText="Log In"
          footerLinkTo="/login"
        >
          <div />
        </AuthLayout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });
});
