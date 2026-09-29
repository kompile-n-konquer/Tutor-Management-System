import DashboardPreview from "./DashboardPreview";

const TRUST_BADGES = ["Automated Allocation", "Instant Timesheets", "CSAM Verified"];

/**
 * Hero — headline, waitlist capture and the live DashboardPreview showcasing
 * the actual TutorFlow tutor dashboard.
 */
export default function Hero() {
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
