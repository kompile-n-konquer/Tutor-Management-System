/**
 * RememberDeviceField — the overlay forms' "Remember this Device" checkbox.
 * The native input stays in the DOM (sr-only) so keyboard users and assistive
 * technology get a real checkbox; the visible box and tick are driven by the
 * .remember-check styles in index.css and animate with transform + opacity
 * only, so toggling never causes layout shift or paint jank.
 *
 * A unique id per form is required: on md+ both forms are mounted side by
 * side, and duplicate ids would make the labels point at each other's input.
 */
export default function RememberDeviceField({ id, checked, onChange }) {
  return (
    <label htmlFor={id} className="remember-check flex items-start gap-2.5 cursor-pointer select-none w-fit">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />

      <span
        aria-hidden="true"
        className="remember-box mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border border-outline-variant bg-surface flex items-center justify-center"
      >
        <span className="material-symbols-outlined remember-tick text-[13px] leading-none text-on-primary">check</span>
      </span>

      <span className="leading-tight">
        <span className="block text-xs font-semibold text-on-surface">Remember this device</span>
        <span className="block text-[11px] text-on-surface-variant">
          Skip sign-in next time you visit from this trusted device.
        </span>
      </span>
    </label>
  );
}
