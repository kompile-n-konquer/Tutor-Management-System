import { Link, Navigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout.jsx";
import useAuth from "../../hooks/useAuth.js";
import useDashboardAlerts from "../../hooks/useDashboardAlerts.js";
import LecturerCourses from "./LecturerCourses.jsx";
import PriorityPanel from "./PriorityPanel.jsx";
import TutorSchedule from "./TutorSchedule.jsx";

// One header for every role — the subtitle is where the role speaks.
const ROLE_BLURBS = {
  tutor: "Your schedule, cover requests and timesheets — what needs you comes first.",
  lecturer: "Your courses, cover decisions and timesheet reviews.",
  organiser: "Staffing, reviews and approvals across the school.",
  admin: "Staffing, reviews and approvals across the school.",
  student: "Your applications and next steps.",
};

// Organisers and admins share the same working set — the priority feed above
// says what needs attention; these cards take them where it gets fixed.
const STAFF_LINKS = [
  { to: "/organiser", icon: "dashboard", label: "Allocation", detail: "Assign tutors to courses" },
  { to: "/organiser-analytics", icon: "analytics", label: "Analytics", detail: "Claimable hours and utilisation" },
  { to: "/timesheets", icon: "history_edu", label: "Timesheets", detail: "Review submitted hours" },
  { to: "/swap-review", icon: "swap_horiz", label: "Swap approvals", detail: "Approve agreed swaps" },
  { to: "/application-review", icon: "fact_check", label: "Applications", detail: "Tutor and lecturer requests" },
  { to: "/courses", icon: "menu_book", label: "Courses", detail: "Manage courses and slots" },
];

const STUDENT_LINKS = [
  { to: "/applications", icon: "workspace_premium", label: "Applications", detail: "Tutor opportunities open to you" },
  { to: "/timetable/edit", icon: "calendar_month", label: "Timetable", detail: "Keep your availability current" },
  { to: "/onboarding", icon: "upgrade", label: "Become a Tutor/Lecturer", detail: "Apply for a tutoring role" },
];

function LinkCards({ heading, links, ariaLabel }) {
  return (
    <section aria-label={ariaLabel} className="space-y-stack-md">
      <h2 className="font-headline-md text-headline-md text-on-surface">{heading}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-start gap-stack-md bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md hover:border-primary/60 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px] text-primary shrink-0" aria-hidden="true">
              {link.icon}
            </span>
            <span className="min-w-0">
              <span className="block font-body-md text-body-md font-semibold text-on-surface">
                {link.label}
              </span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant mt-unit">
                {link.detail}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Dashboard
 * The single, unified landing page for every staff role. The priority feed at
 * the top answers "what needs me right now?" (live via useDashboardAlerts);
 * below it, the role's own working content — the tutor's schedule, the
 * lecturer's courses and cover decisions, or the organiser/admin tool cards.
 */
export default function Dashboard() {
  const { currentUser, role, loading: authLoading } = useAuth();
  const { items, isLoading, loadError, lastRefreshedAt, refresh } = useDashboardAlerts();

  if (!authLoading && !currentUser) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout title="Dashboard">
      <div className="p-margin-page max-w-container-max mx-auto w-full space-y-gutter">
        <header>
          <h1 className="font-display text-display text-on-surface">Dashboard</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-unit">
            {ROLE_BLURBS[role] ?? "Everything that needs your attention."}
          </p>
        </header>

        <PriorityPanel
          items={items}
          isLoading={isLoading}
          loadError={loadError}
          onRetry={refresh}
          lastRefreshedAt={lastRefreshedAt}
        />

        {role === "tutor" && <TutorSchedule />}
        {role === "lecturer" && <LecturerCourses />}
        {(role === "organiser" || role === "admin") && (
          <LinkCards
            heading="Your tools"
            ariaLabel="Organiser tools"
            links={STAFF_LINKS}
          />
        )}
        {role === "student" && (
          <LinkCards heading="Next steps" ariaLabel="Next steps" links={STUDENT_LINKS} />
        )}
      </div>
    </AppLayout>
  );
}
