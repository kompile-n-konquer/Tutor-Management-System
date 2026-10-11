import { useState } from "react";
import { useNavigate } from "react-router-dom";

import useAsync from "../../../hooks/useAsync.js";
import useAuth from "../../../hooks/useAuth.js";
import Input from "../../../components/input/Input.jsx";
import isValidEmail from "../../../utils/validEmail.js";
import ErrorMessage from "../../../components/error-message/ErrorMessage.jsx";
import Button from "../../../components/button/Button.jsx";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../../firebase/firebase.js";
import api from "../../../utils/axiosInstance.js";
import { ROLE_HOME_ROUTE } from "../../../constants/roles.js";
import { useAuthOverlay } from "./AuthOverlayContext.js";
import AuthRedirectSkeleton from "./AuthRedirectSkeleton.jsx";
import RememberDeviceField from "./RememberDeviceField.jsx";
import useRememberDevice from "./useRememberDevice.js";

/**
 * SignupForm — the overlay's Sign Up panel. The Firebase + backend logic is
 * the former /signup page's, unchanged: create the Firebase user, persist the
 * backend profile, refresh the auth context, then navigate by role.
 *
 * Like the login panel, the overlay stays up on a skeleton while the role is
 * resolved, then navigate + close land together — no landing-page flash.
 *
 * "Remember this Device" re-points Firebase persistence (local vs session)
 * right before the account is created, so a fresh registration can also make
 * the device trusted.
 */
const SignupForm = () => {
  const navigate = useNavigate();
  const { closeAuthOverlay, switchAuthMode } = useAuthOverlay();
  const { refreshRole } = useAuth();
  const { setError, execute, isLoading, error } = useAsync();
  const { rememberDevice, setRememberDevice, applyPersistenceChoice } = useRememberDevice();
  const [data, setData] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [redirecting, setRedirecting] = useState(false);

  const handleSignup = async (event) => {
    event.preventDefault();
    setError("");

    const firebaseResponse = await execute(async () => {
      // Persistence must be in place before the account is created so the
      // fresh session is stored in the tier the checkbox promises.
      await applyPersistenceChoice();
      return createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    });
    if (firebaseResponse && firebaseResponse.user) {
      const extraData = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.trim(),
        firebaseUid: firebaseResponse.user.uid,
      };
      const apiResponse = await execute(() => api.post("/users", extraData));

      if (apiResponse?.status === 201) {
        // Refresh the auth context so the sidebar picks up the new role, with
        // the overlay held open on the skeleton until the hand-off lands.
        setRedirecting(true);
        const profile = await refreshRole();
        const role = profile?.role?.toLowerCase() || "student";
        navigate(ROLE_HOME_ROUTE[role] || "/volunteer");
        closeAuthOverlay();
      }
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

  if (redirecting) return <AuthRedirectSkeleton />;

  return (
    <div className="w-full max-w-md mx-auto space-y-4 my-auto">
      <div className="space-y-1">
        <h2 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Create an Account</h2>
        <p className="font-label-caps text-label-caps text-on-surface-variant">
          Register your computer science credentials
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-3 pt-stack-sm">
        <div className="grid grid-cols-2 gap-3">
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

        <RememberDeviceField id="signup-remember-device" checked={rememberDevice} onChange={setRememberDevice} />

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="pt-stack-sm">
          <Button
            type="submit"
            disabled={disableBtn}
            loading={isLoading}
            className="bg-brand-900 hover:bg-brand-800 text-white shadow-glow-brand hover:shadow-glow-amber hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]"
          >
            <span className="group flex items-center justify-center gap-2">
              Create Account
              <span className="material-symbols-outlined text-[18px] group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </span>
          </Button>
        </div>
      </form>

      <p className="font-label-caps text-label-caps text-on-surface-variant text-center pt-2">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => switchAuthMode("login")}
          className="font-bold text-primary hover:opacity-80 underline underline-offset-2 transition-opacity"
        >
          Log In
        </button>
      </p>
    </div>
  );
};

export default SignupForm;
