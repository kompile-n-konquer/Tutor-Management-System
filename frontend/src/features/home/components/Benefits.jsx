const AUDIENCE_CARDS = [
  {
    icon: "hub",
    eyebrow: "For Organisers",
    title: "One board, every allocation",
    body: "Assign tutors based on marks, availability, and weekly hour limits — no spreadsheets or email tag required. Maintain full oversight across all Computer Science and Applied Mathematics course codes.",
    checklist: [
      "Automated mark criteria validation",
      "Weekly hourly cap enforcement (max 10 hrs)",
      "One-click lab practical roster generation",
    ],
    iconClasses: "bg-brand-100 text-brand-900",
    tagClasses: "text-brand-800 bg-brand-100/80",
    checkClasses: "text-brand-600",
    titleHoverClasses: "group-hover:text-brand-900",
    footerClasses: "text-brand-900",
    footerLabel: "Organiser Dashboard Tools",
    footerCta: "View Demo",
  },
  {
    icon: "calendar_clock",
    eyebrow: "For Tutors",
    title: "Your hours, handled properly",
    body: "Log hours in seconds, submit timesheets cleanly, and request session excusals when life happens. Stay in control of your academic schedule and tutoring commitments.",
    checklist: [
      "Seamless digital timesheet submissions",
      "Automated session excusal workflows",
      "Claim overflow grading & tutoring slots",
    ],
    iconClasses: "bg-secondary-fixed text-on-secondary-fixed-variant",
    tagClasses: "text-on-secondary-fixed-variant bg-secondary-fixed/90",
    checkClasses: "text-secondary",
    titleHoverClasses: "group-hover:text-secondary",
    footerClasses: "text-secondary",
    footerLabel: "Tutor Portal Features",
    footerCta: "Explore",
  },
];

/**
 * Benefits — the "Why Use Tutor Flow" section with side-by-side cards for
 * organisers and tutors.
 */
export default function Benefits() {
  return (
    <section id="benefits" className="py-20 bg-surface-container-lowest border-y border-outline-variant/50 scroll-mt-24">
      <div className="max-w-container-max mx-auto px-margin-page">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
            Why Use Tutor Flow
          </h2>
          <p className="text-base sm:text-lg text-on-surface-variant leading-relaxed">
            Built to take the administrative weight off organisers and tutors, so more time goes into teaching.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {AUDIENCE_CARDS.map((card) => (
            <div
              key={card.eyebrow}
              className="bg-surface-container-low/70 rounded-3xl p-8 sm:p-10 border border-outline-variant/80 shadow-sm hover:shadow-glow-soft transition-all flex flex-col justify-between group"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm ${card.iconClasses}`}>
                    <span className="material-symbols-outlined text-[28px]">{card.icon}</span>
                  </div>
                  <span className={`font-label-caps text-label-caps uppercase tracking-wider px-3 py-1.5 rounded-lg ${card.tagClasses}`}>
                    {card.eyebrow}
                  </span>
                </div>

                <div className="space-y-3">
                  <h3 className={`text-2xl font-bold text-on-surface tracking-tight transition-colors ${card.titleHoverClasses}`}>
                    {card.title}
                  </h3>
                  <p className="text-on-surface-variant text-sm sm:text-base leading-relaxed">{card.body}</p>
                </div>

                <ul className="space-y-2.5 pt-2 text-xs sm:text-sm text-on-surface-variant font-label-caps">
                  {card.checklist.map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <span className={`material-symbols-outlined text-[18px] shrink-0 ${card.checkClasses}`}>
                        check_circle
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-8 mt-6 border-t border-outline-variant/80 flex items-center justify-between text-xs font-label-caps font-semibold uppercase tracking-wider">
                <span className={card.footerClasses}>{card.footerLabel}</span>
                <span className={`${card.footerClasses} flex items-center gap-1 group-hover:translate-x-1 transition-transform`}>
                  {card.footerCta}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
