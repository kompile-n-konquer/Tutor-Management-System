import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorMessage from './ErrorMessage.jsx';

describe('ErrorMessage — inline form error text', () => {
  test('renders its children as text', () => {
    render(<ErrorMessage>The email or password you entered is incorrect.</ErrorMessage>);

    expect(screen.getByText('The email or password you entered is incorrect.')).toBeInTheDocument();
  });

  test('renders as a paragraph element', () => {
    const { container } = render(<ErrorMessage>Something broke</ErrorMessage>);
    expect(container.querySelector('p')).toBeInTheDocument();
  });
});
