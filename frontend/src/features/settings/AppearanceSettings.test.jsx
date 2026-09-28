import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeProvider from '../context/ThemeProvider.jsx';
import AppearanceSettings from './AppearanceSettings.jsx';

const STORAGE_KEY = 'tutorflow-theme';

const resetDocument = () => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  window.localStorage.clear();
};

// Settings card under test, mounted exactly as the app mounts it —
// inside the real ThemeProvider so switches flow through the full context.
const renderCard = () =>
  render(
    <ThemeProvider>
      <AppearanceSettings />
    </ThemeProvider>,
  );

describe('AppearanceSettings — theme controls in Settings', () => {
  beforeEach(() => {
    resetDocument();
    delete window.matchMedia;
  });

  afterEach(() => {
    resetDocument();
    delete window.matchMedia;
  });

  test('renders the card with colour mode, high contrast and colour vision controls', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: /appearance & accessibility/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /dark/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /system/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /high contrast/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/colour vision mode/i)).toBeInTheDocument();
  });

  test('light is the checked colour mode by default', () => {
    renderCard();

    expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /dark/i })).not.toBeChecked();
  });

  test('selecting Dark switches <html> to the dark class and persists it', () => {
    renderCard();

    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).colorMode).toBe('dark');
  });

  test('ticking High contrast adds the high-contrast class', () => {
    renderCard();

    const toggle = screen.getByRole('checkbox', { name: /high contrast/i });
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).toBeChecked();
    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
  });

  test('choosing a colour vision mode applies its palette class', () => {
    renderCard();

    const select = screen.getByLabelText(/colour vision mode/i);
    expect(select.value).toBe('none');

    fireEvent.change(select, { target: { value: 'tritanopia' } });

    expect(select.value).toBe('tritanopia');
    expect(document.documentElement.classList.contains('theme-tritanopia')).toBe(true);
  });

  test('reset to defaults only appears once a preference changed and clears all classes', () => {
    renderCard();

    // Nothing custom yet — no reset offered.
    expect(screen.queryByRole('button', { name: /reset to defaults/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /dark/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /high contrast/i }));

    const reset = screen.getByRole('button', { name: /reset to defaults/i });
    fireEvent.click(reset);

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('high-contrast')).toBe(false);
    expect(screen.getByRole('radio', { name: /light/i })).toBeChecked();
    expect(screen.queryByRole('button', { name: /reset to defaults/i })).not.toBeInTheDocument();
  });

  test('explains what the currently selected colour mode does', () => {
    renderCard();

    expect(screen.getByText(/light surfaces with dark text/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /system/i }));
    expect(screen.getByText(/follows your device/i)).toBeInTheDocument();
  });
});
