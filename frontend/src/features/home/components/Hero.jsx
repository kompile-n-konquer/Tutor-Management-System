import { useState } from "react";
import isValidEmail from "../../../utils/validEmail";
import DashboardPreview from "./DashboardPreview";

const TRUST_BADGES = ["Automated Allocation", "Instant Timesheets", "CSAM Verified"];

/**
 * Hero — headline, waitlist capture and the live DashboardPreview showcasing
 * the actual TutorFlow tutor dashboard.
 */
export default function Hero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ requested: false, error: false });

  function handleRequestAccess(event) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setStatus({ requested: false, error: true });
      return;
    }
    setStatus({ requested: true, error: false });
  }

  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden">
      <div className="max-w-container-max mx-auto px-margin-page">
        <div className="text-center max-w-3xl mx-auto space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-50 border border-brand-200/70 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-secondary-container animate-pulse" />
            <span className="font-label-caps text-xs text-brand-900 tracking-wide uppercase">
              Computer Science &amp; Applied Mathematics
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold text-on-surface tracking-tight leading-[1.12]">
            Tutoring made{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-900 via-brand-500 to-secondary-container">
              easier.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-on-surface-variant leading-relaxed max-w-2xl mx-auto">
            A centralized platform for Computer Science and Applied Mathematics tutor management, allocation, and
            volunteer opportunities. Streamline your academic journey with intelligent tools.
          </p>

          {/* Early-access capture */}
          <div className="pt-4 flex flex-col items-center gap-3 w-full max-w-md mx-auto">
            {status.requested ? (
              <div
                role="status"
                className="w-full flex items-center gap-3 px-5 py-4 rounded-xl bg-brand-50 border border-brand-200 text-brand-900 shadow-glow-soft"
              >
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                <p className="font-body-sm text-body-sm">
                  You&apos;re on the list! We&apos;ll notify you at <span className="font-semibold">{email}</span> when early access opens.
                </p>
              </div>
            ) : (
              <form onSubmit={handleRequestAccess} className="w-full" noValidate>
                <div className="relative w-full flex items-center shadow-glow-soft rounded-xl overflow-hidden bg-surface-container-lowest border border-outline-variant focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/25 transition-all">
                  <input
                    type="email"
                    placeholder="Enter your .edu email"
                    aria-label="Email address"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setStatus({ requested: false, error: false });
                    }}
                    className="w-full px-5 py-4 font-body-md text-body-md text-on-surface placeholder:text-outline bg-transparent focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="absolute right-1 top-1 bottom-1 bg-brand-900 hover:bg-brand-800 text-white font-label-caps text-label-caps uppercase tracking-wider px-4 sm:px-6 rounded-lg transition-colors flex items-center gap-2 active:scale-[0.98]"
                  >
                    Request Access
                    <span className="material-symbols-outlined text-secondary-container text-[16px] hidden sm:inline">bolt</span>
                  </button>
                </div>
                {status.error && (
                  <p className="mt-2 text-left font-body-sm text-body-sm text-error flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">error</span>
                    Please enter a valid email address.
                  </p>
                )}
              </form>
            )}
            <p className="text-[11px] text-outline font-label-caps">Join 150+ tutors currently on the waitlist.</p>
          </div>

          {/* Trust badges */}
          <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-on-surface-variant font-label-caps">
            {TRUST_BADGES.map((badge) => (
              <span key={badge} className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-emerald-500 text-[18px]">verified</span>
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Live preview of the real TutorFlow dashboard */}
        <DashboardPreview />
      </div>
    </section>
  );
}
