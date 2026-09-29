import { useEffect, useState, useCallback } from "react";
import ThemeContext, { COLOR_MODES, COLOUR_BLIND_MODES } from "./ThemeContext";

// Persisted under this key as JSON: { colorMode, highContrast, colourBlindMode }.
// The inline script in index.html reads the same key before React mounts so the
// first paint already carries the right theme (no flash of the light theme).
const STORAGE_KEY = "tutorflow-theme";

const DEFAULT_PREFERENCES = {
  colorMode: "light",
  highContrast: false,
  colourBlindMode: "none",
};

function readStoredPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      colorMode: COLOR_MODES.includes(parsed.colorMode) ? parsed.colorMode : DEFAULT_PREFERENCES.colorMode,
      highContrast: typeof parsed.highContrast === "boolean" ? parsed.highContrast : DEFAULT_PREFERENCES.highContrast,
      colourBlindMode: COLOUR_BLIND_MODES.includes(parsed.colourBlindMode)
        ? parsed.colourBlindMode
        : DEFAULT_PREFERENCES.colourBlindMode,
    };
  } catch {
    return null; // corrupt or unavailable storage falls back to defaults
  }
}

const systemPrefersDark = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;

export default function ThemeProvider({ children }) {
  const [preferences, setPreferences] = useState(() => readStoredPreferences() ?? DEFAULT_PREFERENCES);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  const { colorMode, highContrast, colourBlindMode } = preferences;
  const isDark = colorMode === "dark" || (colorMode === "system" && prefersDark);

  // Keep the resolved "system" preference fresh while the OS setting changes.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event) => setPrefersDark(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Reflect the preferences onto <html> so the CSS custom-property themes apply.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.classList.toggle("high-contrast", highContrast);
    COLOUR_BLIND_MODES
      .filter((mode) => mode !== "none")
      .forEach((mode) => root.classList.remove(`theme-${mode}`));
    if (colourBlindMode !== "none") root.classList.add(`theme-${colourBlindMode}`);
    // color-scheme also themes native form controls and scrollbars.
    root.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark, highContrast, colourBlindMode]);

  // Persist every change so the choice survives reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage unavailable (private mode, quota) — themes still apply for the session.
    }
  }, [preferences]);

  const setColorMode = useCallback((mode) => {
    if (!COLOR_MODES.includes(mode)) return;
    setPreferences((prev) => ({ ...prev, colorMode: mode }));
  }, []);

  const setHighContrast = useCallback((enabled) => {
    setPreferences((prev) => ({ ...prev, highContrast: Boolean(enabled) }));
  }, []);

  const setColourBlindMode = useCallback((mode) => {
    if (!COLOUR_BLIND_MODES.includes(mode)) return;
    setPreferences((prev) => ({ ...prev, colourBlindMode: mode }));
  }, []);

  const resetThemePreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  const value = {
    colorMode,
    highContrast,
    colourBlindMode,
    isDark,
    setColorMode,
    setHighContrast,
    setColourBlindMode,
    resetThemePreferences,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
