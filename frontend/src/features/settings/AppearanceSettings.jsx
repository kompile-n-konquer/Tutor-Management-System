import { useTheme, COLOR_MODES, COLOUR_BLIND_MODES } from "../context/ThemeContext";

// How each colour mode is labelled and iconised in the segmented control.
const COLOR_MODE_OPTIONS = [
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "system", label: "System", icon: "desktop_windows" },
];

// Descriptions shown under the colour vision select so users can pick the
// mode that matches how they see colour, not just by clinical name.
const COLOUR_BLIND_LABELS = {
  none: "Default colours",
  protanopia: "Protanopia (red-blind)",
  deuteranopia: "Deuteranopia (green-blind)",
  tritanopia: "Tritanopia (blue-blind)",
};

const isDefaultTheme = (theme) =>
  theme.colorMode === "light" && !theme.highContrast && theme.colourBlindMode === "none";

const AppearanceSettings = () => {
  const theme = useTheme();

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
      <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
        <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          Appearance &amp; Accessibility
        </h3>
        <p className="font-body-sm text-outline mt-1">
          Adjust how TutorFlow looks. Preferences are saved to this browser and apply
          across the whole app — darker surfaces, stronger contrast, or palettes tuned
          for colour vision deficiencies.
        </p>
      </div>

      <div className="space-y-gutter">
        {/* Colour mode — native radios give keyboard + screen reader support. */}
        <fieldset>
          <legend className="font-body-md text-body-md text-on-surface font-semibold mb-stack-sm">
            Colour mode
          </legend>
          <div className="inline-flex flex-wrap gap-stack-sm" role="radiogroup" aria-label="Colour mode">
            {COLOR_MODE_OPTIONS.map(({ value, label, icon }) => {
              const checked = theme.colorMode === value;
              return (
                <label
                  key={value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors font-body-md text-body-md ${
                    checked
                      ? "bg-primary-container border-primary text-on-primary-container"
                      : "border-outline-variant text-on-surface hover:bg-surface-container"
                  }`}
                >
                  <input
                    type="radio"
                    name="color-mode"
                    value={value}
                    checked={checked}
                    onChange={() => theme.setColorMode(value)}
                    className="sr-only"
                  />
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    {icon}
                  </span>
                  {label}
                </label>
              );
            })}
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-stack-sm">
            {theme.colorMode === "system"
              ? "Follows your device’s colour scheme and updates when it changes."
              : theme.colorMode === "dark"
                ? "Dark surfaces with light text — easier in low light."
                : "Light surfaces with dark text."}
          </p>
        </fieldset>

        {/* High contrast — a native checkbox styled as a switch. */}
        <div className="flex items-center justify-between gap-gutter">
          <div>
            <label
              htmlFor="high-contrast-toggle"
              className="font-body-md text-body-md text-on-surface font-semibold"
            >
              High contrast
            </label>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Stronger borders and darker text for maximum legibility.
            </p>
          </div>
          <label htmlFor="high-contrast-toggle" className="relative inline-block cursor-pointer shrink-0">
            <input
              id="high-contrast-toggle"
              type="checkbox"
              checked={theme.highContrast}
              onChange={(event) => theme.setHighContrast(event.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-outline-variant after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
          </label>
        </div>

        {/* Colour vision deficiency palette. */}
        <div>
          <label
            htmlFor="colour-blind-mode"
            className="font-body-md text-body-md text-on-surface font-semibold block mb-stack-sm"
          >
            Colour vision mode
          </label>
          <select
            id="colour-blind-mode"
            value={theme.colourBlindMode}
            onChange={(event) => theme.setColourBlindMode(event.target.value)}
            className="border border-outline-variant bg-surface rounded-lg px-4 py-2 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none min-w-64"
          >
            {COLOUR_BLIND_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {COLOUR_BLIND_LABELS[mode]}
              </option>
            ))}
          </select>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-stack-sm">
            Remaps red/green and blue/orange status colours so approvals, rejections and
            warnings stay distinguishable.
          </p>
        </div>

        {!isDefaultTheme(theme) && (
          <button
            type="button"
            onClick={theme.resetThemePreferences}
            className="text-primary font-label-caps text-label-caps hover:underline cursor-pointer"
          >
            Reset to defaults
          </button>
        )}
      </div>
    </div>
  );
};

// Re-exported for consumers that render options dynamically.
export { COLOR_MODES, COLOUR_BLIND_MODES };

export default AppearanceSettings;
