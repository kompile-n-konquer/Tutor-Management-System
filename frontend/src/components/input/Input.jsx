import { useState } from "react";

const Input = ({ onChange, type, placeholder, value, labelText, icon, isPassword }) => {
    const [showPassword, setShowPassword] = useState(false);

    const id = labelText
        ? labelText.toLowerCase().replace(/\s+/g, "-")
        : undefined;

    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    return (
        <section className="group space-y-1">
            <label
                htmlFor={id}
                className="font-label-caps text-label-caps text-on-surface-variant block transition-colors group-focus-within:text-primary"
            >
                {labelText}
            </label>

            <div className="relative">
                {icon && (
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <span className="material-symbols-outlined text-outline text-lg transition-colors group-focus-within:text-primary">
                            {icon}
                        </span>
                    </div>
                )}

                <input
                    value={value}
                    id={id}
                    type={inputType}
                    placeholder={placeholder}
                    onChange={onChange}
                    className={`peer w-full rounded-DEFAULT border-outline-variant bg-surface py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm ${
                        icon ? "pl-10" : "px-4"
                    } ${isPassword ? "pr-10" : icon ? "pr-4" : ""}`}
                />

                {/* The focus ring fades in via opacity — the old focus:ring-1
                    popped in instantly as a box-shadow. Pure opacity, so
                    focusing a field never repaints layout. */}
                <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-DEFAULT ring-1 ring-primary opacity-0 transition-opacity duration-200 peer-focus:opacity-100"
                />

                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline hover:text-primary transition-[color,scale] active:scale-90"
                    >
                        <span className="material-symbols-outlined text-lg">
                            {showPassword ? "visibility" : "visibility_off"}
                        </span>
                    </button>
                )}
            </div>
        </section>
    );
};

export default Input;