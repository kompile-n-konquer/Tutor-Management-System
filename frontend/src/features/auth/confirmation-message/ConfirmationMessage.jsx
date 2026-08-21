import { Link } from "react-router-dom";

export default function ConfirmationMessage() {
  return (
    <div className="bg-background min-h-screen text-on-surface font-body-md flex items-center justify-center p-margin-page">

      <div className="w-full max-w-[500px] bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-stack-lg text-center">

        <div className="flex justify-center mb-stack-md">
          <span className="material-symbols-outlined text-primary text-[48px]">
            mark_email_read
          </span>
        </div>

        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Check Your Email
        </h1>

        <p className="font-body-md text-body-md text-on-surface-variant mt-stack-md">
          If a user with that email exists in our records, a password
          reset email has been sent. Please check your email to continue
          resetting your password.
        </p>

        <Link
          to="/login"
          className="inline-flex items-center justify-center gap-2 mt-stack-lg bg-primary-container text-on-primary rounded-DEFAULT px-6 py-3 font-label-caps text-label-caps uppercase hover:bg-primary transition-colors"
        >
          Back to Login

          <span className="material-symbols-outlined text-sm">
            login
          </span>
        </Link>

      </div>

    </div>
  );
}