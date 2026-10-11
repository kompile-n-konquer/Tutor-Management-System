const FEATURES = [
  {
    icon: "hub",
    title: "Allocation Board",
    body: "Drag-and-drop assignment matrix balancing lab practical slots, tutor subject mastery, and timetable availability.",
  },
  {
    icon: "history_edu",
    title: "Digital Timesheets",
    body: "Automated monthly timesheet generation with supervisor sign-offs, line-item breakdowns, and payroll exports.",
  },
  {
    icon: "event_busy",
    title: "Session Excusals",
    body: "Hassle-free absence filing that automatically notifies course coordinators and organises replacement cover.",
  },
  {
    icon: "workspace_premium",
    title: "Tutor Intake Portal",
    body: "Centralized application management for postgraduate and senior undergrads applying for paid and volunteer positions.",
  },
  {
    icon: "volunteer_activism",
    title: "Overflow Work",
    body: "Broadcast extra assignment grading or lab support tasks to eligible tutors looking to fulfil their remaining weekly hours.",
  },
  {
    icon: "admin_panel_settings",
    title: "Role-Based Access",
    body: "Strict permission gates with tailored views for organisers, lecturers, tutors, students, and administrators.",
  },
];

/**
 * Features — the six-pillar overview of what the platform ships today.
 */
export default function Features() {
  return (
    <section id="features" className="py-20 md:py-24 bg-surface-container-low/60 scroll-mt-24">
      <div className="max-w-container-max mx-auto px-margin-page">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="font-label-caps text-xs font-bold text-brand-800 uppercase tracking-widest bg-brand-100/70 px-3 py-1 rounded-md">
            Comprehensive Toolset
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
            Features Built for CSAM
          </h2>
          <p className="text-base sm:text-lg text-on-surface-variant">
            Everything course coordinators, head tutors, and student assistants need in one streamlined environment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-surface-container-lowest rounded-2xl p-7 border border-outline-variant/80 shadow-sm hover:shadow-glow-soft transition-all hover:-translate-y-1 group"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand-900 flex items-center justify-center mb-5 group-hover:bg-brand-900 group-hover:text-white group-hover:shadow-glow-brand transition-colors">
                <span className="material-symbols-outlined text-[24px]">{feature.icon}</span>
              </div>
              <h3 className="text-xl font-bold text-on-surface mb-2">{feature.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
