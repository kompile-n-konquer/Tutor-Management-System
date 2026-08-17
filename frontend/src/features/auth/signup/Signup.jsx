import { useState } from "react";
import { useNavigate } from "react-router-dom";

import useAsync from "../../../hooks/useAsync.js";
import isValidEmail from "../../../utils/validEmail.js";
import ErrorMessage from "../../../components/error-message/ErrorMessage.jsx";
import Input from "../../../components/input/Input.jsx";
import Button from "../../../components/button/Button.jsx";
import AuthLayout from "../../../components/auth-layout/AuthLayout.jsx";

import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../../firebase/firebase.js";

export default function Signup() {
  const navigate = useNavigate();
  const { setError, execute, isLoading, error } = useAsync();

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const response = await execute(() => createUserWithEmailAndPassword(auth, email, password));
    if (response) navigate("/tutor-dashboard");
  }

  function handleChange(setter) {
    return (e) => { setError(""); setter(e.target.value); };
  }

  const disableButton =
    !firstName || !surname || !email || !password || !confirmPassword || !isValidEmail(email);

  return (
    <AuthLayout
      heading="Create an Account"
      description="Register to manage your scheduling, track academic progress, and connect with the computer science faculty network."
      footerPrompt="Already have an account? "
      footerLinkText="Log In"
      footerLinkTo="/login"
    >
        <form onSubmit={handleSubmit} className="space-y-stack-md mt-stack-lg">
            <div className="grid grid-cols-2 gap-stack-md">
                    <Input labelText="First Name" placeholder="Alan" value={firstName} onChange={handleChange(setFirstName)} />
                    <Input labelText="Surname" placeholder="Turing" value={surname} onChange={handleChange(setSurname)} />
            </div>

            <Input labelText="Email Address" type="email" icon="mail" placeholder="alan.turing@university.edu" value={email} onChange={handleChange(setEmail)} />
            <Input labelText="Password" icon="lock" isPassword placeholder="••••••••" value={password} onChange={handleChange(setPassword)} />
            <Input labelText="Confirm Password" icon="lock_reset" isPassword placeholder="••••••••" value={confirmPassword} onChange={handleChange(setConfirmPassword)} />

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="pt-stack-sm">
                <Button type="submit" disabled={disableButton} loading={isLoading}>
                    Sign Up
                </Button>
            </div>
        </form>
    </AuthLayout>
  );
}