import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button.jsx';

describe('Button — shared UI component used in auth flows', () => {
  test('renders children text when not loading', () => {
    render(<Button>Login</Button>);
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  test('displays "Loading..." text and hides children when loading is true', () => {
    render(<Button loading>Login</Button>);
    expect(screen.getByRole('button', { name: /loading/i })).toBeInTheDocument();
    expect(screen.queryByText('Login')).not.toBeInTheDocument();
  });

  test('shows children text again when loading transitions to false', () => {
    const { rerender } = render(<Button loading>Create Account</Button>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    rerender(<Button loading={false}>Create Account</Button>);
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  test('is disabled when disabled prop is true', () => {
    render(<Button disabled>Submit</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  test('is enabled when disabled prop is false', () => {
    render(<Button disabled={false}>Submit</Button>);
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  test('calls onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click Me</Button>);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        Click Me
      </Button>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  test('does not call onClick when loading (prevents duplicate submissions)', () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} loading>
        Click Me
      </Button>,
    );

    // Fixed: Button now sets disabled={disabled || loading}, so the native
    // disabled attribute blocks clicks during loading, preventing duplicate submissions.
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).not.toHaveBeenCalled();
  });

  test('passes through extra HTML attributes via rest props spreading', () => {
    // Fixed: Button now spreads ...rest onto the <button>, so type="submit"
    // (and other passed attributes) correctly reach the DOM element.
    const { container } = render(<Button type="submit">Submit</Button>);
    expect(container.querySelector('button')).toHaveAttribute('type', 'submit');
  });
});