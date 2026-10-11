import { useContext } from "react";

import AuthContext from "../../context/AuthContext.js";

/**
 * TrustedDeviceNotice — the "already signed in on this device" shortcut at
 * the top of the Login panel. It reads the AuthProvider session straight
 * from the context (the provider is optional here, so the throwing useAuth
 * hook is deliberately avoided) and renders nothing unless a live session
 * was restored — i.e. the visitor is a returning user on a device Firebase
 * still trusts. "Continue" re-resolves the role and walks straight to the
 * dashboard, bypassing re-authentication; "Sign out" clears the persisted
 * session so a different account can sign in.
 *
 * The entrance is a pure transform + opacity keyframe (.auth-rise in
 * index.css) — no layout-affecting properties are animated.
 */
export default function TrustedDeviceNotice({ onContinue, busy = false }) {
  const authContext = useContext(AuthContext);
  const currentUser = authContext?.currentUser;

  if (!currentUser) return null;

  const label = currentUser.email || currentUser.displayName || "your account";

  return (
    <div className="auth-rise">
      <div className="flex items-center gap-3 rounded-2xl border border-outline-variant/70 bg-surface-container-low p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <span
            className="material-symbols-outlined text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified_user
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-on-surface">You&apos;re already signed in</p>
          <p className="truncate text-[11px] text-on-surface-variant">{label}</p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="shrink-0 rounded-lg bg-primary px-3.5 py-2 font-label-caps text-[11px] font-bold uppercase tracking-wider text-on-primary hover:opacity-90 active:scale-[0.97] transition-[opacity,scale] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>

      <p className="pt-2 text-center text-[11px] text-on-surface-variant">
        Not you?{" "}
        <button
          type="button"
          onClick={() => authContext.signOut?.()}
          className="font-bold text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
        >
          Sign out
        </button>
      </p>
    </div>
  );
}
