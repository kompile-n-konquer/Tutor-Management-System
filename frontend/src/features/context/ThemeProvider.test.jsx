import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ThemeProvider from './ThemeProvider.jsx';
import { useTheme } from './ThemeContext.js';

const STORAGE_KEY = 'tutorflow-theme';

// The <html> element and localStorage are shared across tests in this file —
// reset both so one test's theme never leaks into the next.
const resetDocument = () => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  window.localStorage.clear();
};

const storePreferences = (prefs) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
};

// jsdom ships no matchMedia; install one we can drive from tests.
const installMatchMedia = (initiallyDark) => {
  const listeners = {};
  const mediaQuery = {
    matches: initiallyDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (event, handler) => {
      listeners[event] = handler;
    },
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mediaQuery);
  return {
    // Flip the OS colour scheme and notify subscribers the way a browser does.
    setDark: (dark) => {
      mediaQuery.matches = dark;
      if (listeners.change) listeners.change({ matches: dark });
    },
  };
};

const Probe = () => {
  const theme = useTheme();
  return (
    <div>
      <span data-testid="color-mode">{theme.colorMode}</span>
      <span data-testid="is-dark">{String(theme.isDark)}</span>
      <span data-testid="high-contrast">{String(theme.highContrast)}</span>
      <span data-testid="colour-blind-mode">{theme.colourBlindMode}</span>
      <button onClick={() => theme.setColorMode('dark')}>set-dark</button>
      <button onClick={() => theme.setHighContrast(true)}>set-contrast</button>
      <button onClick={() => theme.setColourBlindMode('tritanopia')}>set-tritanopia</button>
      <button onClick={() => theme.setColorMode('neon')}>set-invalid-mode</button>
      <button onClick={() => theme.setColourBlindMode('nope')}>set-invalid-cb</button>
      <button onClick={() => theme.resetThemePreferences()}>reset</button>
    </div>
  );
};

describe('ThemeProvider — dark / high contrast / colourblind theming', () => {
  beforeEach(() => {
    resetDocument();
    delete window.matchMedia;
  });

  afterEach(() => {
    resetDocument();
    delete window.matchMedia;
  });

  test('renders children and applies light defaults when nothing is stored', () => {
    render(
      <ThemeProvider>
        <p>Hello theme</p>
      </ThemeProvider>,
    );

    expect(screen.getByText('Hello theme')).toBeInTheDocument();
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('high-contrast')).toBe(false);
    expect(root.classList.contains('theme-protanopia')).toBe(false);
  });

  test('persists the defaults to localStorage on mount', () => {
    render(
      <ThemeProvider>
        <p>x</p>
      </ThemeProvider>,
    );

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      colorMode: 'light',
      highContrast: false,
      colourBlindMode: 'none',
    });
  });

  test('restores every preference from localStorage onto <html>', () => {
    storePreferences({ colorMode: 'dark', highContrast: true, colourBlindMode: 'protanopia' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('high-contrast')).toBe(true);
    expect(root.classList.contains('theme-protanopia')).toBe(true);
    expect(screen.getByTestId('is-dark').textContent).toBe('true');
  });

  test('falls back to defaults when stored values are invalid', () => {
    storePreferences({ colorMode: 'neon', highContrast: 'yes', colourBlindMode: 'nope' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('color-mode').textContent).toBe('light');
    expect(screen.getByTestId('high-contrast').textContent).toBe('false');
    expect(screen.getByTestId('colour-blind-mode').textContent).toBe('none');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  test('falls back to defaults when localStorage holds corrupt JSON', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('color-mode').textContent).toBe('light');
  });

  test('setColorMode("dark") toggles the dark class and persists the choice', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('set-dark'));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).colorMode).toBe('dark');
  });

  test('setHighContrast(true) adds the high-contrast class', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('set-contrast'));

    expect(document.documentElement.classList.contains('high-contrast')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).highContrast).toBe(true);
  });

  test('setColourBlindMode swaps the palette class when the mode changes', () => {
    storePreferences({ colorMode: 'light', highContrast: false, colourBlindMode: 'protanopia' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    const root = document.documentElement;
    expect(root.classList.contains('theme-protanopia')).toBe(true);

    fireEvent.click(screen.getByText('set-tritanopia'));

    expect(root.classList.contains('theme-protanopia')).toBe(false);
    expect(root.classList.contains('theme-tritanopia')).toBe(true);
  });

  test('resetThemePreferences clears every theme class off <html>', () => {
    storePreferences({ colorMode: 'dark', highContrast: true, colourBlindMode: 'deuteranopia' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('reset'));

    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.classList.contains('high-contrast')).toBe(false);
    expect(root.classList.contains('theme-deuteranopia')).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      colorMode: 'light',
      highContrast: false,
      colourBlindMode: 'none',
    });
  });

  test('"system" mode follows the OS preference and reacts to live changes', () => {
    const media = installMatchMedia(false);
    storePreferences({ colorMode: 'system', highContrast: false, colourBlindMode: 'none' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    // OS says light → no dark class.
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // OS flips to dark → the class arrives without a reload.
    act(() => media.setDark(true));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByTestId('is-dark').textContent).toBe('true');
  });

  test('"system" mode resolves dark when the OS already prefers dark', () => {
    installMatchMedia(true);
    storePreferences({ colorMode: 'system', highContrast: false, colourBlindMode: 'none' });
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  test('ignores invalid colour mode and colour vision values instead of corrupting state', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('set-invalid-mode'));
    fireEvent.click(screen.getByText('set-invalid-cb'));

    expect(screen.getByTestId('color-mode').textContent).toBe('light');
    expect(screen.getByTestId('colour-blind-mode').textContent).toBe('none');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('theme-nope')).toBe(false);
  });

  test('useTheme outside a provider throws a helpful error', () => {
    // Silence React's error boundary noise for the expected throw.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consumer = () => render(<Probe />);

    expect(consumer).toThrow(/must be used within a ThemeProvider/i);
    consoleError.mockRestore();
  });
});

describe('ThemeContext — exported constants', () => {
  test('exposes the colour and colour vision mode lists consumers validate against', async () => {
    const { COLOR_MODES, COLOUR_BLIND_MODES } = await import('./ThemeContext.js');
    expect(COLOR_MODES).toEqual(['light', 'dark', 'system']);
    expect(COLOUR_BLIND_MODES).toEqual(['none', 'protanopia', 'deuteranopia', 'tritanopia']);
  });
});
