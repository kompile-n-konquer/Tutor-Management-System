import { useState } from "react";
import { useNavigate } from "react-router-dom";

import useAsync from "../../../hooks/useAsync.js";
import Input from "../../../components/input/Input.jsx";
import isValidEmail from "../../../utils/validEmail.js";
import ErrorMessage from "../../../components/error-message/ErrorMessage.jsx";
import Button from "../../../components/button/Button.jsx";
import AuthLayout from "../../../components/auth-layout/AuthLayout.jsx";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../../firebase/firebase.js";
import api from "../../../utils/axiosInstance.js";

const Signup = () => {
  const navigate = useNavigate();
  const { setError, execute, isLoading, error } = useAsync();
  const [data, setData] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");

    const firebaseResponse = await execute(() => createUserWithEmailAndPassword(auth, data.email, data.password));
    if (firebaseResponse && firebaseResponse.user) {
      const extraData = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        firebaseUid: firebaseResponse.user.uid,
      };
      const apiResponse = await execute(() => api.post("/users", extraData));

      if (apiResponse.status === 201) navigate("/home");
    }
  };

  const handleChange = (event, name) => {
    setError("");
    setData((prevData) => ({ ...prevData, [name]: event.target.value }));
  };

  const disableBtn =
    !data.firstName ||
    !data.lastName ||
    !data.password ||
    !data.email ||
    !data.confirmPassword ||
    !isValidEmail(data.email);

  return (
    <AuthLayout
      heading="Create an Account"
      description="Register to manage your scheduling, track academic progress, and connect with the computer science faculty network."
      footerPrompt="Already have an account? "
      footerLinkText="Log In"
      footerLinkTo="/login"
    >
      <form onSubmit={handleSignup} className="space-y-stack-md mt-stack-lg">
        <div className="grid grid-cols-2 gap-stack-md">
          <Input
            labelText="First Name"
            placeholder="Alan"
            value={data.firstName}
            onChange={(e) => handleChange(e, "firstName")}
          />
          <Input
            labelText="Last Name"
            placeholder="Turing"
            value={data.lastName}
            onChange={(e) => handleChange(e, "lastName")}
          />
        </div>

        <Input
          labelText="Email Address"
          type="email"
          icon="mail"
          placeholder="alan.turing@university.edu"
          value={data.email}
          onChange={(e) => handleChange(e, "email")}
        />

        <Input
          labelText="Password"
          icon="lock"
          isPassword
          placeholder="••••••••"
          value={data.password}
          onChange={(e) => handleChange(e, "password")}
        />

        <Input
          labelText="Confirm Password"
          icon="lock_reset"
          isPassword
          placeholder="••••••••"
          value={data.confirmPassword}
          onChange={(e) => handleChange(e, "confirmPassword")}
        />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="pt-stack-sm">
          <Button type="submit" disabled={disableBtn} loading={isLoading}>
            Create Account
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
};

export default Signup;