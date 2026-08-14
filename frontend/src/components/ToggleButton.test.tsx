import { render, screen, fireEvent } from '@testing-library/react';
import ToggleButton from './ToggleButton';

describe('ToggleButton', () => {
  test('renders with default off label', () => {
    render(<ToggleButton />);
    expect(screen.getByRole('button', { name: /activate/i })).toBeInTheDocument();
  });

  test('toggles state and label on click', () => {
    render(<ToggleButton />);
    const button = screen.getByRole('button', { name: /activate/i });

    // Initially inactive
    expect(button).toHaveAttribute('data-active', 'false');

    // Click → becomes active
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /deactivate/i })).toHaveAttribute(
      'data-active',
      'true',
    );

    // Click again → becomes inactive
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }));
    expect(screen.getByRole('button', { name: /activate/i })).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  test('uses custom labels when provided', () => {
    render(<ToggleButton offLabel="Start" onLabel="Stop" />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
  });

  test('calls onToggle callback with the new state', () => {
    const handleToggle = jest.fn();
    render(<ToggleButton onToggle={handleToggle} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleToggle).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole('button'));
    expect(handleToggle).toHaveBeenCalledTimes(2);
    expect(handleToggle).toHaveBeenLastCalledWith(false);
  });

  test('multiple rapid clicks maintain correct state', () => {
    render(<ToggleButton />);
    const button = screen.getByRole('button');

    // Click 3 times: off → on → off → on
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button', { name: /deactivate/i })).toHaveAttribute(
      'data-active',
      'true',
    );
  });
});
