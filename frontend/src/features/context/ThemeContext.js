import { createContext, useContext } from "react";

// Resolved colour appearance the app renders in — "system" follows the OS.
export const COLOR_MODES = ["light", "dark", "system"];
// Colour vision deficiency palettes. Protanopia and deuteranopia (red-green)
// share one blue/orange-safe palette; tritanopia (blue-yellow) gets its own.
export const COLOUR_BLIND_MODES = ["none", "protanopia", "deuteranopia", "tritanopia"];

const ThemeContext = createContext(null);

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === null) {
    throw new Error("The useTheme must be used within a ThemeProvider and not directly");
  }

  return context;
}

export default ThemeContext;
