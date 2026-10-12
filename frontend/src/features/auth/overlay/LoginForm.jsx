import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import useAsync from "../../../hooks/useAsync.js";
import Input from "../../../components/input/Input.jsx";
import isValidEmail from "../../../utils/validEmail.js";
import ErrorMessage from "../../../components/error-message/ErrorMessage.jsx";
import Button from "../../../components/button/Button.jsx";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth } from "../../../firebase/firebase.js";
import provider from "../../../firebase/googleProvider.js";
import GoogleIcon from "../../../components/google-icon/GoogleIcon.jsx";
import api from "../../../utils/axiosInstance.js";
import { ROLE_HOME_ROUTE } from "../../../constants/roles.js";
import { useAuthOverlay } from "./AuthOverlayContext.js";
import AuthRedirectSkeleton from "./AuthRedirectSkeleton.jsx";
import RememberDeviceField from "./RememberDeviceField.jsx";
import TrustedDeviceNotice from "./TrustedDeviceNotice.jsx";
import useRememberDevice from "./useRememberDevice.js";

/**
 * LoginForm — the overlay's Log In panel. The Firebase + backend logic is the
 * former /login page's, unchanged: validate the email, sign in (email or
 * Google popup), fetch the profile role and navigate to the role's home route.
 *
 * On success the overlay stays up showing AuthRedirectSkeleton while the role
 * is resolved, then navigate + close land together — the landing page never
 * reappears in between.
 *
 * "Remember this Device" re-points Firebase persistence (local vs session)
 * right before each sign-in attempt, and a TrustedDeviceNotice offers
 * returning visitors on a remembered device a one-click continue that
 * bypasses re-authentication entirely.
 */
export default function LoginForm() {
  const navigate = useNavigate();
  const { closeAuthOverlay, switchAuthMode } = useAuthOverlay();
  const { setError, execute, isLoading, error } = useAsync();
  const { rememberDevice, setRememberDevice, applyPersistenceChoice } = useRememberDevice();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isValidEmail(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    const response = await execute(async () => {
      // Persistence must be in place before Firebase signs in, otherwise the
      // session lands in the default tier regardless of the checkbox.
      await applyPersistenceChoice();
      return signInWithEmailAndPassword(auth, email, password);
    });
    if (response?.user) await redirectToRoleHome();
  }

  async function handleGoogleLogin() {
    setError("");
    const response = await execute(async () => {
      await applyPersistenceChoice();
      return signInWithPopup(auth, provider);
    });
    if (response?.user) await redirectToRoleHome();
  }

  async function redirectToRoleHome() {
    setRedirecting(true);
    const meResponse = await execute(() => api.get("/users/me"));
    if (meResponse?.status === 200 && meResponse.data.role) {
      const role = meResponse.data.role.toLowerCase();
      // Navigate before closing so the route swap and the overlay removal
      // commit together instead of exposing the landing page mid-flight.
      navigate(ROLE_HOME_ROUTE[role] || "/dashboard");
      closeAuthOverlay();
    } else {
      // No profile or role yet — hand control back to the form.
      setRedirecting(false);
    }
  }

  if (redirecting) return <AuthRedirectSkeleton />;

  return (
    <div className="w-full max-w-md mx-auto space-y-5 my-auto">
      <TrustedDeviceNotice onContinue={redirectToRoleHome} busy={isLoading} />

      <div className="space-y-1">
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Welcome Back</h2>
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          Access your academic scheduling portal
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-stack-md pt-stack-sm">
        <Input
          labelText="Email Address"
          type="email"
          icon="mail"
          placeholder="alan.turing@university.edu"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
          }}
        />

        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="font-label-caps text-label-caps text-on-surface-variant block">Password</label>

            <Link
              to="/forgot-password"
              className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors"
            >
              Forgot Password?
            </Link>
          </div>

          <Input
            icon="lock"
            isPassword
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
          />
        </div>

        <RememberDeviceField id="login-remember-device" checked={rememberDevice} onChange={setRememberDevice} />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="pt-stack-sm space-y-stack-sm">
          <Button
            type="submit"
            loading={isLoading}
            className="bg-brand-900 hover:bg-brand-800 text-white shadow-glow-brand hover:shadow-glow-amber hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            <span className="group flex items-center justify-center gap-2">
              Log In
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </span>
          </Button>

          <Button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant hover:border-outline hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            <span className="group flex items-center justify-center gap-2">
              <span className="inline-flex group-hover:scale-110 transition-transform">
                <GoogleIcon />
              </span>
              Sign In with Google
            </span>
          </Button>
        </div>
      </form>

      <p className="font-label-caps text-label-caps text-on-surface-variant text-center pt-2">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={() => switchAuthMode("signup")}
          className="font-bold text-primary hover:opacity-80 underline underline-offset-2 transition-opacity"
        >
          Sign Up
        </button>
      </p>
    </div>
  );
}
