import { useState } from "react";
import {Link,  useNavigate } from "react-router-dom";

import useAsync from "../../../hooks/useAsync.js";
import isValidEmail from "../../../utils/validEmail.js";
import ErrorMessage from "../../../components/error-message/ErrorMessage.jsx";
import Input from "../../../components/input/Input.jsx";
import Button from "../../../components/button/Button.jsx";
import AuthLayout from "../../../components/auth-layout/AuthLayout.jsx";

import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { auth } from "../../../firebase/firebase.js";
import provider from "../../../firebase/googleProvider.js";

export default function Login() {
  const navigate = useNavigate();
  const { setError, execute, isLoading, error } = useAsync();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    const response = await execute(() => signInWithEmailAndPassword(auth, email, password));
    if (response) navigate("/tutor-dashboard");
  }

  async function handleGoogleLogin() {
    setError("");
    const response = await execute(() => signInWithPopup(auth, provider));
    if (response) navigate("/tutor-dashboard");
  }

  return (
    <AuthLayout
      heading="Welcome Back"
      description="Sign in to manage your scheduling, track academic progress, and connect with the computer science faculty network."
      footerPrompt="Don't have an account? "
      footerLinkText="Sign Up"
      footerLinkTo="/signup"
    >
        <form onSubmit={handleSubmit} className="space-y-stack-md mt-stack-lg">
            <Input
                labelText="Email Address"
                type="email"
                icon="mail"
                placeholder="alan.turing@university.edu"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
            />

            <div className="space-y-1">
                <div className="flex justify-between items-center">
                    <label className="font-label-caps text-label-caps text-on-surface-variant block">
                        Password
                    </label>

                    <Link
                        to="/forgot-password"
                        className="font-body-sm text-body-sm text-primary hover:text-primary-container transition-colors font-semibold"
                    >
                        Forgot Password?
                    </Link>
                </div>

                <Input
                    icon="lock"
                    isPassword
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                />
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="pt-stack-sm space-y-stack-sm">
                <Button type="submit" loading={isLoading}>
                    Log In
                </Button>

                <Button type="button" onClick={handleGoogleLogin} disabled={isLoading}>
                    Sign In with Google
                </Button>
            </div>
        </form>
    </AuthLayout>
  );
}