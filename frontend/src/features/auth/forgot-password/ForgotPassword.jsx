import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import useAsync from '../../../hooks/useAsync.js';

import Input from "../../../components/input/Input.jsx";
import isValidEmail from '../../../utils/validEmail.js';
import ErrorMessage from '../../../components/error-message/ErrorMessage.jsx';
import Button from '../../../components/button/Button.jsx';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../firebase/firebase.js';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { setError, execute, isLoading, error } = useAsync();

  const [email, setEmail] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const response = await execute(() => sendPasswordResetEmail(auth, email.trim()));

    if (response) {
      navigate("/confirmation-message");
    }
  }

  const disableButton = !email || !isValidEmail(email);

  return (
    <div className="bg-background min-h-screen text-on-surface font-body-md flex items-center justify-center p-margin-page">
      <div className="w-full max-w-[500px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-stack-lg">
        <div className="mb-stack-lg">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-primary hover:text-primary-container transition-colors font-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Login
          </Link>

          <h1 className="font-headline-lg text-headline-lg text-on-surface mt-stack-md">
            Forgot your password?
          </h1>

          <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
            Don't worry. Enter your email below and we'll send you a password reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-stack-md">
          <Input
            labelText="Email Address"
            type="email"
            icon="mail"
            placeholder="example@testmaker.com"
            value={email}
            onChange={(e) => {
              setError("");
              setEmail(e.target.value);
            }}
          />

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Button type="submit" disabled={disableButton} loading={isLoading}>
            Send Reset Link
          </Button>
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