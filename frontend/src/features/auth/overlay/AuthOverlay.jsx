import { useEffect, useRef } from "react";
import { useAuthOverlay } from "./AuthOverlayContext.js";
import LoginForm from "./LoginForm.jsx";
import SignupForm from "./SignupForm.jsx";

const OVERLAY_COPY = {
  login: {
    heading: "Welcome Back",
    subtext: "Sign in to manage your scheduling, track academic progress, and connect with the computer science faculty network.",
  },
  signup: {
    heading: "Create an Account",
    subtext: "Register to manage your scheduling, track academic progress, and connect with the computer science faculty network.",
  },
};

/**
 * AuthOverlay — the dual-form sliding authentication modal that floats over
 * the landing page. Desktop (md+) shows the Login and Sign Up panels side by
 * side with a gradient cover sliding over the inactive one; below md the
 * overlay collapses to a single-column modal that swaps forms directly.
 *
 * The landing page stays visible behind a darkened backdrop; the overlay
 * closes via the X button, either "Back to Landing Page" button, the Escape
 * key or a backdrop click, leaving the landing page state untouched.
 *
 * Mount/unmount is driven entirely by the provider's isOpen flag. Every bit
 * of motion — the mount fade/rise, the cover slide, the form settle and the
 * mode-copy swap — is pure CSS (see .auth-overlay-* / .smooth-slide /
 * .auth-copy-swap in index.css) using translate/transform and opacity only,
 * so no animation state lives in this component.
 */
export default function AuthOverlay() {
  const { isOpen, mode, closeAuthOverlay } = useAuthOverlay();
  const panelRef = useRef(null);

  // Move focus into the dialog when it appears so keyboard users start inside it.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const isLogin = mode === "login";
  const copy = OVERLAY_COPY[mode];

  // Active panels ease toward the centre while the cover slides away (the
  // offset matches the cover's travel direction); inactive panels sit under
  // the cover, dimmed and unhittable. Only opacity + translate animate.
  const formWrapper = (active, inactiveOffset) =>
    [
      "w-full flex flex-col p-6 sm:p-8 md:p-12 overflow-y-auto custom-scrollbar",
      "md:absolute md:inset-y-0 md:w-1/2 md:block",
      "md:transition-[opacity,translate] md:duration-500 md:ease-[cubic-bezier(0.65,0,0.35,1)]",
      active
        ? "md:opacity-100 md:pointer-events-auto md:translate-x-0"
        : `md:opacity-20 md:pointer-events-none ${inactiveOffset}`,
    ].join(" ");

  return (
    <div
      className="auth-overlay-backdrop fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
      onClick={closeAuthOverlay}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tutor Flow sign in or sign up"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="auth-overlay-panel relative w-full max-w-5xl max-h-[calc(100dvh-1rem)] md:h-[680px] flex flex-col bg-surface-container-lowest rounded-3xl shadow-2xl border border-outline-variant/60 overflow-hidden outline-none"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={closeAuthOverlay}
          aria-label="Close authentication overlay"
          className="absolute top-4 right-4 z-40 p-2 bg-surface-container-high hover:bg-surface-container-highest rounded-full text-on-surface-variant hover:text-on-surface transition-all duration-200 active:scale-90"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        {/* LOGIN panel — left half on desktop, only form on mobile in login mode */}
        <div className={`${formWrapper(isLogin, "md:-translate-x-1.5")} ${isLogin ? "block" : "hidden"} md:left-0`}>
          <button
            type="button"
            onClick={closeAuthOverlay}
            className="flex items-center gap-1.5 text-primary hover:opacity-80 font-label-caps text-label-caps uppercase w-fit group transition-[opacity,scale] active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
              arrow_back
            </span>
            Back to Landing Page
          </button>

          <LoginForm />
        </div>

        {/* SIGN UP panel — right half on desktop, only form on mobile in signup mode */}
        <div className={`${formWrapper(!isLogin, "md:translate-x-1.5")} ${!isLogin ? "block" : "hidden"} md:right-0`}>
          <button
            type="button"
            onClick={closeAuthOverlay}
            className="flex items-center gap-1.5 text-primary hover:opacity-80 font-label-caps text-label-caps uppercase w-fit group transition-[opacity,scale] active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
              arrow_back
            </span>
            Back to Landing Page
          </button>

          <SignupForm />
        </div>

        {/* Sliding gradient cover — desktop only, sits over the inactive form */}
        <div
          aria-hidden="true"
          className={`smooth-slide absolute top-0 left-0 w-1/2 h-full z-30 hidden md:block ${
            isLogin ? "translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="gradient-panel w-full h-full p-10 md:p-14 text-white flex flex-col justify-between relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 dot-mesh opacity-10 pointer-events-none" />
            <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-full bg-secondary-container/10 blur-3xl pointer-events-none" />

            {/* Brand */}
            <div className="relative z-10 flex items-center gap-3">
              <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
                <span
                  className="material-symbols-outlined text-[24px] text-white"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  school
                </span>
              </div>
              <span className="font-headline-lg text-2xl font-extrabold tracking-tight text-white">
                Tutor Flow
              </span>
            </div>

            {/* Mode copy — re-keyed per mode so the fade replays on switch */}
            <div key={mode} className="auth-copy-swap relative z-10 my-auto">
              <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-4 leading-tight">
                {copy.heading}
              </h3>
              <p className="text-sm md:text-base text-white/85 leading-relaxed font-light max-w-sm">
                {copy.subtext}
              </p>
            </div>

            {/* Support */}
            <div className="relative z-10 pt-4 border-t border-white/10">
              <span className="block font-label-caps text-[10px] tracking-widest text-amber-200 uppercase mb-0.5">
                Support
              </span>
              <span className="font-body-sm text-body-sm text-white/90">csam.help@university.edu</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
