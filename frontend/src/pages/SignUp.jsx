import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import useAsync from "../hooks/useAsync.js";
import isValidEmail from "../utils/validEmail.js";
import ErrorMessage from "../components/error-message/ErrorMessage.jsx";

import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase/firebase.js";

export default function SignUp() {
  const navigate = useNavigate();

  // Firebase/authentication state
  const { setError, execute, isLoading, error } = useAsync();

  // Form state
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Password visibility state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // =========================================
  // HANDLE SIGN UP
  // =========================================

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");

    // Check that the passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Create the Firebase account
    // First name and surname are currently only collected
    // by the frontend. The existing authentication system
    // only creates the account using email + password.
    const response = await execute(() =>
      createUserWithEmailAndPassword(auth, email, password)
    );

    // Keep the authentication page's existing behaviour
    if (response) {
      navigate("/tutor-dashboard");
    }
  }

  // =========================================
  // HANDLE INPUT CHANGES
  // =========================================

  function handleInputChange(setter) {
    return (e) => {
      setError("");
      setter(e.target.value);
    };
  }

  // =========================================
  // FORM VALIDATION
  // =========================================

  const disableButton =
    !firstName ||
    !surname ||
    !email ||
    !password ||
    !confirmPassword ||
    !isValidEmail(email);

  return (
    <div className="bg-background min-h-screen text-on-surface font-body-md flex antialiased">
      <div className="flex min-h-screen w-full">

        {/* =========================================
            BRAND PANEL - LEFT
        ========================================== */}

        <div className="hidden lg:flex lg:w-1/2 relative bg-primary-container overflow-hidden p-margin-page flex-col justify-between">

          {/* Decorative background */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 100% 0%, var(--tw-colors-primary-fixed-dim) 0%, transparent 50%), radial-gradient(circle at 0% 100%, var(--tw-colors-tertiary-fixed-dim) 0%, transparent 50%)",
            }}
          />

          {/* Logo */}
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-stack-lg">

              <span className="material-symbols-outlined text-[32px] text-primary-fixed">
                school
              </span>

              <h1 className="font-headline-lg text-headline-lg text-on-primary font-bold tracking-tight">
                CSAM Portal
              </h1>

            </div>
          </div>

          {/* Main message */}
          <div className="relative z-10 max-w-md">

            <h2 className="font-display text-display text-on-primary mb-stack-md leading-tight">
              Join the Academic Nexus.
            </h2>

            <p className="font-body-lg text-body-lg text-primary-fixed-dim">
              Register to manage your scheduling, track academic progress,
              and connect with the computer science faculty network.
            </p>

          </div>

          {/* Support */}
          <div className="relative z-10 flex gap-4 text-primary-fixed-dim">

            <div className="flex flex-col gap-1">

              <span className="font-label-caps text-label-caps uppercase opacity-70">
                Support
              </span>

              <span className="font-body-sm text-body-sm">
                csam.help@university.edu
              </span>

            </div>

          </div>
        </div>

        {/* =========================================
            REGISTRATION FORM - RIGHT
        ========================================== */}

        <div className="flex w-full lg:w-1/2 items-center justify-center p-margin-page bg-surface-container-lowest shadow-[-20px_0_40px_rgba(0,0,0,0.05)] relative z-20">

          <div className="w-full max-w-[440px] space-y-stack-lg">

            {/* Header */}
            <div className="text-center lg:text-left space-y-unit">

              {/* Mobile logo */}
              <div className="flex items-center justify-center lg:hidden gap-2 mb-stack-md">

                <span className="material-symbols-outlined text-[32px] text-primary">
                  school
                </span>

                <h1 className="font-headline-md text-headline-md text-primary font-bold">
                  CSAM Portal
                </h1>

              </div>

              {/* Back to Home */}
              <Link
                to="/"
                className="inline-flex items-center gap-1 mt-3 text-primary hover:text-primary-container transition-colors font-body-sm"
              >

                <span className="material-symbols-outlined text-[18px]">
                  arrow_back
                </span>

                Back to Home

              </Link>

              <h2 className="font-headline-lg text-headline-lg text-on-surface">
                Create an Account
              </h2>

              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Enter your details below to request access.
              </p>

            </div>

            {/* =========================================
                FORM
            ========================================== */}

            <form
              onSubmit={handleSubmit}
              className="space-y-stack-md mt-stack-lg"
            >

              {/* First Name + Surname */}
              <div className="grid grid-cols-2 gap-stack-md">

                <div className="space-y-1">

                  <label
                    className="font-label-caps text-label-caps text-on-surface-variant block"
                    htmlFor="firstName"
                  >
                    First Name
                  </label>

                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    placeholder="Alan"
                    required
                    value={firstName}
                    onChange={handleInputChange(setFirstName)}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface px-4 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
                  />

                </div>

                <div className="space-y-1">

                  <label
                    className="font-label-caps text-label-caps text-on-surface-variant block"
                    htmlFor="surname"
                  >
                    Surname
                  </label>

                  <input
                    id="surname"
                    name="surname"
                    type="text"
                    placeholder="Turing"
                    required
                    value={surname}
                    onChange={handleInputChange(setSurname)}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface px-4 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
                  />

                </div>

              </div>

              {/* Email */}
              <div className="space-y-1">

                <label
                  className="font-label-caps text-label-caps text-on-surface-variant block"
                  htmlFor="email"
                >
                  Email Address
                </label>

                <div className="relative">

                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-lg">
                      mail
                    </span>
                  </div>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="alan.turing@university.edu"
                    required
                    value={email}
                    onChange={handleInputChange(setEmail)}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface pl-10 pr-4 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
                  />

                </div>

              </div>

              {/* Password */}
              <div className="space-y-1">

                <label
                  className="font-label-caps text-label-caps text-on-surface-variant block"
                  htmlFor="password"
                >
                  Password
                </label>

                <div className="relative">

                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-lg">
                      lock
                    </span>
                  </div>

                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={handleInputChange(setPassword)}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface pl-10 pr-10 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((value) => !value)
                    }
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline hover:text-primary transition-colors"
                  >

                    <span className="material-symbols-outlined text-lg">
                      {showPassword
                        ? "visibility"
                        : "visibility_off"}
                    </span>

                  </button>

                </div>

              </div>

              {/* Confirm Password */}
              <div className="space-y-1">

                <label
                  className="font-label-caps text-label-caps text-on-surface-variant block"
                  htmlFor="confirmPassword"
                >
                  Confirm Password
                </label>

                <div className="relative">

                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="material-symbols-outlined text-outline text-lg">
                      lock_reset
                    </span>
                  </div>

                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="••••••••"
                    required
                    value={confirmPassword}
                    onChange={handleInputChange(setConfirmPassword)}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface pl-10 pr-10 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowConfirmPassword(
                        (value) => !value
                      )
                    }
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-outline hover:text-primary transition-colors"
                  >

                    <span className="material-symbols-outlined text-lg">
                      {showConfirmPassword
                        ? "visibility"
                        : "visibility_off"}
                    </span>

                  </button>

                </div>

              </div>

              {/* Firebase error */}
              {error && (
                <ErrorMessage>
                  {error}
                </ErrorMessage>
              )}

              {/* Sign Up Button */}
              <div className="pt-stack-sm">

                <button
                  type="submit"
                  disabled={disableButton || isLoading}
                  className="w-full bg-primary-container text-on-primary rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps uppercase hover:bg-primary hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                >

                  {isLoading ? "Creating Account..." : "Sign Up"}

                  {!isLoading && (
                    <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  )}

                </button>

              </div>

            </form>

            {/* Login link */}
            <div className="text-center pt-stack-md border-t border-surface-variant mt-stack-lg">

              <p className="font-body-sm text-body-sm text-on-surface-variant">

                Already have an account?

                <Link
                  to="/login"
                  className="font-label-caps text-label-caps text-primary hover:text-primary-container hover:underline transition-colors ml-1"
                >
                  Log In
                </Link>

              </p>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}