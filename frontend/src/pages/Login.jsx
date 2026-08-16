import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import useAsync from "../hooks/useAsync.js";

import isValidEmail from "../utils/validEmail.js";

import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth } from "../firebase/firebase.js";
import provider from "../firebase/googleProvider.js";

export default function Login() {
  const navigate = useNavigate();

  const { setError, execute, isLoading, error } = useAsync();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ============================================================
  // EMAIL + PASSWORD LOGIN
  // ============================================================

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");

    const response = await execute(() =>
      signInWithEmailAndPassword(
        auth,
        email,
        password
      )
    );

    if (response) {
      navigate("/tutor-dashboard");
    }
  }

  // ============================================================
  // GOOGLE LOGIN
  // ============================================================

  async function handleLoginWithGoogle(e) {
    e.preventDefault();

    setError("");

    const response = await execute(() =>
      signInWithPopup(auth, provider)
    );

    if (response) {
      navigate("/tutor-dashboard");
    }
  }

  // ============================================================
  // PASSWORD VISIBILITY
  // ============================================================

  function togglePasswordVisibility() {
    setShowPassword((value) => !value);
  }

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex items-center justify-center p-gutter">

      <main className="w-full max-w-[1024px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[600px]">

        {/* =====================================================
            BRAND SIDE
        ====================================================== */}

        <div className="relative w-full md:w-5/12 bg-primary-container p-stack-lg flex flex-col justify-between overflow-hidden">

          <div className="absolute -top-32 -left-32 w-96 h-96 bg-tertiary-container rounded-full blur-[100px] opacity-70" />

          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-secondary-container rounded-full blur-[100px] opacity-40" />

          <div className="relative z-10">

            <h1 className="font-headline-lg text-headline-lg text-on-primary">
              CSAM Portal
            </h1>

            <p className="font-body-md text-body-md text-primary-fixed mt-stack-sm">
              Tutor Management &amp; Allocation System
            </p>

          </div>

          <div className="relative z-10 mt-stack-lg pt-stack-md border-t border-primary-fixed/20">

            <p className="font-body-sm text-body-sm text-primary-fixed-dim">
              Secure access restricted to authorized administrators and registered tutors.
            </p>

          </div>

        </div>


        {/* =====================================================
            FORM SIDE
        ====================================================== */}

        <div className="w-full md:w-7/12 p-stack-lg md:p-12 flex flex-col justify-center bg-surface-container-lowest">

          <div className="mb-stack-lg">

            <h2 className="font-headline-md text-headline-md text-on-surface">
              Sign In
            </h2>

            <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
              Enter your credentials to access your dashboard.
            </p>

            {/* Back to Landing Page */}

            <Link
              to="/"
              className="inline-flex items-center gap-1 mt-3 text-primary hover:text-primary-container font-body-sm transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>

              Back to Home
            </Link>

          </div>


          {/* ===================================================
              LOGIN FORM
          ==================================================== */}

          <form
            onSubmit={handleSubmit}
            className="space-y-stack-md"
          >

            {/* Email */}

            <div>

              <label
                className="block font-label-caps text-label-caps text-on-surface mb-stack-sm"
                htmlFor="email"
              >
                Email
              </label>

              <div className="relative">

                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">

                  <span className="material-symbols-outlined text-outline text-[20px]">
                    mail
                  </span>

                </div>

                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  className="block w-full pl-10 pr-3 py-3 border border-outline-variant rounded-lg bg-surface focus:ring-2 focus:ring-primary focus:border-primary font-body-md text-body-md text-on-surface transition-colors"
                />

              </div>

            </div>


            {/* Password */}

            <div>

              <div className="flex justify-between items-center mb-stack-sm">

                <label
                  className="block font-label-caps text-label-caps text-on-surface"
                  htmlFor="password"
                >
                  Password
                </label>

                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="font-body-sm text-body-sm text-primary hover:text-primary-container transition-colors font-semibold"
                >
                  Forgot Password?
                </button>

              </div>


              <div className="relative">

                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">

                  <span className="material-symbols-outlined text-outline text-[20px]">
                    lock
                  </span>

                </div>


                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  className="block w-full pl-10 pr-10 py-3 border border-outline-variant rounded-lg bg-surface focus:ring-2 focus:ring-primary focus:border-primary font-body-md text-body-md text-on-surface transition-colors"
                />


                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-on-surface transition-colors"
                >

                  <span className="material-symbols-outlined text-[20px]">
                    {showPassword
                      ? "visibility"
                      : "visibility_off"}
                  </span>

                </button>

              </div>

            </div>


            {/* Remember Me */}

            <div className="flex items-center mt-stack-sm">

              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-primary focus:ring-primary border-outline-variant rounded bg-surface"
              />

              <label
                htmlFor="remember-me"
                className="ml-2 block font-body-sm text-body-sm text-on-surface-variant"
              >
                Remember me on this device
              </label>

            </div>


            {/* Firebase Error */}

            {error && (
              <div className="text-sm text-red-600">
                {error}
              </div>
            )}


            {/* Sign In Button */}

            <div className="pt-stack-sm">

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm font-label-caps text-label-caps text-on-primary bg-primary hover:bg-primary-container focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >

                {isLoading ? "Signing In..." : "Sign In"}

                {!isLoading && (
                  <span className="material-symbols-outlined ml-2 text-[18px]">
                    login
                  </span>
                )}

              </button>

            </div>

          </form>


          {/* ===================================================
              SIGN UP
          ==================================================== */}

          <div className="text-center pt-stack-md">

            <p className="font-body-sm text-body-sm text-on-surface-variant">

              Don't have an account?

              <Link
                to="/signup"
                className="font-label-caps text-label-caps text-primary hover:text-primary-container hover:underline transition-colors ml-1"
              >
                Sign Up
              </Link>

            </p>

          </div>


          {/* ===================================================
              GOOGLE SIGN IN
          ==================================================== */}

          <div className="pt-stack-md">

            <button
              type="button"
              onClick={handleLoginWithGoogle}
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-outline-variant rounded-lg font-label-caps text-label-caps text-on-surface bg-surface hover:bg-surface-container-low transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Sign In with Google
            </button>

          </div>


          {/* ===================================================
              FOOTER
          ==================================================== */}

          <div className="mt-auto pt-stack-lg border-t border-surface-variant flex flex-wrap justify-between items-center gap-4">

            <p className="font-body-sm text-body-sm text-on-surface-variant">
              © 2024 School of Computer Science
            </p>

            <div className="flex gap-stack-md font-body-sm text-body-sm">

              <a
                className="text-outline hover:text-primary transition-colors"
                href="#"
              >
                Privacy Policy
              </a>

              <a
                className="text-outline hover:text-primary transition-colors"
                href="#"
              >
                Terms of Use
              </a>

              <a
                className="text-outline hover:text-primary transition-colors"
                href="#"
              >
                Help
              </a>

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}