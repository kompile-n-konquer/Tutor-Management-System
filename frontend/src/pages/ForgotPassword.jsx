import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import useAsync from "../hooks/useAsync.js";
import isValidEmail from "../utils/validEmail.js";
import ErrorMessage from "../components/error-message/ErrorMessage.jsx";

import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase/firebase.js";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const { setError, execute, isLoading, error } = useAsync();

  const [email, setEmail] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");

    const response = await execute(() =>
      sendPasswordResetEmail(auth, email)
    );

    if (response) {
      navigate("/confirmation-message");
    }
  }

  const disableButton =
    !email || !isValidEmail(email);

  return (
    <div className="bg-background min-h-screen text-on-surface font-body-md flex items-center justify-center p-margin-page">

      <div className="w-full max-w-[500px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-stack-lg">

        <div className="mb-stack-lg">

          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-primary hover:text-primary-container transition-colors font-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">
              arrow_back
            </span>

            Back to Login
          </Link>

          <h1 className="font-headline-lg text-headline-lg text-on-surface mt-stack-md">
            Forgot your password?
          </h1>

          <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
            Don't worry. Enter your email below and we'll send you a
            password reset link.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-stack-md"
        >

          <div className="space-y-1">

            <label
              htmlFor="email"
              className="font-label-caps text-label-caps text-on-surface-variant block"
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
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setError("");
                  setEmail(e.target.value);
                }}
                placeholder="example@testmaker.com"
                className="w-full rounded-DEFAULT border-outline-variant bg-surface pl-10 pr-4 py-2 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary focus:bg-surface-container-lowest transition-colors h-11 shadow-sm"
              />

            </div>

          </div>

          {error && (
            <ErrorMessage>
              {error}
            </ErrorMessage>
          )}

          <button
            type="submit"
            disabled={disableButton || isLoading}
            className="w-full bg-primary-container text-on-primary rounded-DEFAULT px-4 py-3 font-label-caps text-label-caps uppercase hover:bg-primary hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Sending..." : "Send Reset Link"}

            {!isLoading && (
              <span className="material-symbols-outlined text-sm">
                send
              </span>
            )}
          </button>

        </form>

        <div className="text-center pt-stack-md mt-stack-lg border-t border-surface-variant">

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Remember your password?

            <Link
              to="/login"
              className="font-label-caps text-label-caps text-primary hover:text-primary-container hover:underline ml-1"
            >
              Log In
            </Link>
          </p>

        </div>

      </div>

    </div>
  );
}