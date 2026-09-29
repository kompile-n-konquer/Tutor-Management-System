import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ConfirmationMessage from './ConfirmationMessage.jsx';

describe('ConfirmationMessage — reset email sent confirmation', () => {
  test('tells the user to check their email and links back to login', () => {
    render(
      <MemoryRouter>
        <ConfirmationMessage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    expect(screen.getByText(/password reset email has been sent/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to login/i })).toHaveAttribute('href', '/login');
  });
});
