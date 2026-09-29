import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from './Input.jsx';

describe('Input — shared form input used in auth flows', () => {
  test('renders with labelText displayed', () => {
    render(<Input labelText="Email" type="email" />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  test('renders input with the specified type attribute', () => {
    render(<Input labelText="Password" type="password" />);
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
  });

  test('renders placeholder text when provided', () => {
    render(<Input labelText="Email" type="email" placeholder="example@testmaker.com" />);
    expect(screen.getByPlaceholderText('example@testmaker.com')).toBeInTheDocument();
  });

  test('displays the current value in the input', () => {
    render(<Input labelText="Email" type="email" value="tutor@wits.ac.za" onChange={() => {}} />);
    expect(screen.getByLabelText(/email/i)).toHaveValue('tutor@wits.ac.za');
  });

  test('calls onChange handler when the user types', () => {
    const handleChange = vi.fn();
    render(<Input labelText="Email" type="email" value="" onChange={handleChange} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'new@email.com' },
    });
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("sets htmlFor on label matching the hyphenated, lowercased labelText", () => {
    render(<Input labelText="First Name" type="text" />);
    const label = screen.getByText('First Name');
    expect(label).toHaveAttribute('for', 'first-name');
  });

  test('renders label element even when labelText is not provided', () => {
    const { container } = render(<Input type="text" />);
    const label = container.querySelector('label');
    expect(label).toBeInTheDocument();
    expect(label).not.toHaveAttribute('for');
  });

  test('controlled input updates value on change (integration pattern)', () => {
    // Simulates how Login.jsx and Signup.jsx use the Input component
    let currentValue = '';
    const Wrapper = () => {
      const [value, setValue] = require('react').useState('');
      currentValue = value;
      return (
        <Input
          labelText="Email"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter email"
        />
      );
    };

    render(<Wrapper />);
    const input = screen.getByLabelText(/email/i);

    fireEvent.change(input, { target: { value: 'kg.newuser@wits.ac.za' } });
    expect(currentValue).toBe('kg.newuser@wits.ac.za');
  });

  describe('password visibility toggle', () => {
    test('renders a masked password input with the toggle in the hidden state', () => {
      render(<Input labelText="Password" type="password" isPassword />);

      expect(screen.getByLabelText(/password/i)).toHaveAttribute('type', 'password');
      // The eye icon starts in the "hidden" state.
      expect(screen.getByText('visibility_off')).toBeInTheDocument();
    });

    test('reveals the password when the eye is clicked and masks it again', () => {
      render(<Input labelText="Password" type="password" isPassword />);
      const input = screen.getByLabelText(/password/i);

      fireEvent.click(screen.getByRole('button'));
      expect(input).toHaveAttribute('type', 'text');
      expect(screen.getByText('visibility')).toBeInTheDocument();
      expect(screen.queryByText('visibility_off')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button'));
      expect(input).toHaveAttribute('type', 'password');
      expect(screen.getByText('visibility_off')).toBeInTheDocument();
    });
  });

  test('renders the leading icon when one is provided', () => {
    render(<Input labelText="Email" type="email" icon="mail" />);

    expect(screen.getByText('mail')).toBeInTheDocument();
  });
});
