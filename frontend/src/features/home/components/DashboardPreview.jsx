import { useMemo, useState } from "react";
import { getNavLinksForRole, FOOTER_LINKS } from "../../../config/navConfig";
import TutorDashboardContent from "../../tutor-dashboard/TutorDashboardContent";
import OrganiserBoardView from "../../organiser/OrganiserBoardView";
import TimesheetsContent from "../../timesheets/TimesheetsContent";
import {
  TUTOR_COURSES,
  buildTutorSessions,
  ORGANISER_COURSES,
  ORGANISER_AVAILABLE,
  ORGANISER_ASSIGNED,
  LECTURER_TIMESHEETS,
} from "./previewSampleData";

/**
 * DashboardPreview — the hero's live showcase of the actual TutorFlow app.
 * Each tab renders the real page component (TutorDashboardContent,
 * OrganiserBoardView, TimesheetsContent) with sample data, inside a static
 * replica of the app shell whose sidebar changes with the role, like the
 * real one. Nothing here navigates, fetches or needs auth, and nothing
 * auto-plays: the visitor picks a tab.
 */

const ACCOUNT_LABELS = ["Profile", "Settings", "Logout"];

const TABS = [
  {
    id: "tutor",
    label: "Tutor",
    slug: "tutor-dashboard",
    role: "tutor",
    title: "Tutor Dashboard",
    activeLabel: "Tutor Dashboard",
    showConflicts: false,
    user: { initials: "AM", name: "Alex Mercer", role: "Tutor" },
    sections: [
      ["Main Menu", ["Tutor Dashboard"]],
      ["General", ["Events", "Applications", "Volunteer View", "Timesheets", "Timetable"]],
    ],
  },
  {
    id: "organiser",
    label: "Organiser",
    slug: "organiser-board",
    role: "organiser",
    title: "Tutor Management System",
    activeLabel: "Organiser Board",
    user: { initials: "SO", name: "System Organiser", role: "Organiser" },
    sections: [
      ["Main Menu", ["Organiser Board", "Analytics"]],
      ["General", ["Courses", "Events", "Timesheets", "Applications"]],
    ],
  },
  {
    id: "lecturer",
    label: "Lecturer",
    slug: "timesheets",
    role: "lecturer",
    title: "Timesheets",
    activeLabel: "Timesheets",
    user: { initials: "JO", name: "James Okafor", role: "Lecturer" },
    sections: [
      ["Main Menu", ["Lecturer View"]],
      ["General", ["Courses", "Events", "Timesheets"]],
    ],
  },
];

// Used only when navConfig has no link with that label for the role.
const FALLBACK_ICONS = {
  "Tutor Dashboard": "badge",
  "Organiser Board": "dashboard",
  Analytics: "analytics",
  "Lecturer View": "school",
  Courses: "menu_book",
  Events: "calendar_today",
  Applications: "workspace_premium",
  "Volunteer View": "volunteer_activism",
  Timesheets: "history_edu",
  Timetable: "calendar_month",
  Profile: "person",
  Settings: "settings",
  Logout: "logout",
};

// Static replicas must not be focusable or clickable. (Set as an attribute so
// it works on any React version.)
const inertRef = (node) => {
  if (node) node.setAttribute("inert", "");
};

const formatPreviewTime = (session) => session.timeLabel;

function SectionLabel({ children }) {
  return <p className="font-label-caps text-[10px] text-on-sidebar-muted px-3 pt-3 pb-1">{children}</p>;
}

function NavItem({ icon, label, isActive = false }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${
        isActive ? "bg-sidebar-active text-on-sidebar-active font-semibold" : "text-on-sidebar font-medium"
      }`}
    >
      <span
        className="material-symbols-outlined text-[20px] shrink-0"
        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span className="font-body-sm text-body-sm truncate">{label}</span>
    </div>
  );
}

export default function DashboardPreview() {
  const [activeId, setActiveId] = useState("tutor");
  const tab = TABS.find((t) => t.id === activeId) ?? TABS[0];

  const tutorSessions = useMemo(buildTutorSessions, []);
  const organiserCourse = ORGANISER_COURSES[0];

  // Icons come from the real navConfig for the tab's role, so they match the app.
  const iconFor = (label) => {
    const link =
      (getNavLinksForRole(tab.role) ?? []).find((l) => l.label === label) ??
      FOOTER_LINKS.find((l) => l.label === label);
    return link?.icon ?? FALLBACK_ICONS[label] ?? "circle";
  };

  const handleTabKeyDown = (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = TABS.findIndex((t) => t.id === activeId);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setActiveId(next.id);
    document.getElementById(`preview-tab-${next.id}`)?.focus();
  };

  return (
    <div className="mt-12 md:mt-16 max-w-5xl mx-auto">
      {/* Role tabs — the visitor chooses; nothing auto-advances */}
      <div className="flex justify-center mb-6">
        <div
          role="tablist"
          aria-label="Preview TutorFlow as a different role"
          onKeyDown={handleTabKeyDown}
          className="inline-flex items-center gap-1 rounded-full bg-ink-900 border border-ink-700 p-1"
        >
          {TABS.map((t) => {
            const isSelected = t.id === activeId;
            return (
              <button
                key={t.id}
                id={`preview-tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={isSelected}
                aria-controls="preview-panel"
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveId(t.id)}
                className={`px-4 py-1.5 rounded-full font-label-caps text-[12px] transition-colors ${
                  isSelected ? "bg-brand-500 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative">
        {/* Decorative outer glow */}
        <div className="absolute -inset-1.5 bg-gradient-to-r from-brand-600 via-brand-800 to-secondary-container rounded-[1.75rem] opacity-30 blur-2xl pointer-events-none" />

        {/* Browser window frame (OLED dark) */}
        <div className="relative bg-ink-900 rounded-3xl shadow-2xl border border-ink-700 overflow-hidden">
          {/* Window chrome bar */}
          <div className="bg-ink-950 px-4 py-3 border-b border-ink-700 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
              <span className="w-3 h-3 rounded-full bg-secondary-container shrink-0" />
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <span className="ml-2 font-label-caps text-xs text-white/40 truncate hidden sm:inline">
                tutorflow · {tab.slug}
              </span>
            </div>
            <div className="flex items-center gap-2 font-label-caps text-[11px] text-white/40 shrink-0">
              <span className="relative inline-flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 animate-ping opacity-60" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
              </span>
              <span>Live App Preview</span>
            </div>
          </div>

          {/* App body — app shell replica + the real page component */}
          <div className="flex bg-background h-[480px] sm:h-[540px] md:h-[620px]">
            {/* Floating sidebar panel replica */}
            <aside
              ref={inertRef}
              className="hidden lg:flex flex-col w-56 shrink-0 m-3 rounded-xl bg-sidebar-surface shadow-sidebar py-3"
            >
              <div className="px-3 pb-1 flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-sidebar-logo text-on-sidebar-logo shrink-0 flex items-center justify-center font-body-sm text-[13px] font-bold">
                  TF
                </div>
                <div className="min-w-0">
                  <p className="font-body-md text-[15px] font-bold text-on-sidebar truncate leading-tight">
                    Tutor Flow
                  </p>
                  <p className="font-label-caps text-[9px] text-on-sidebar-muted truncate">
                    School of Computer Science
                  </p>
                </div>
              </div>

              <nav className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 space-y-0.5">
                {tab.sections.map(([heading, labels]) => (
                  <div key={heading}>
                    <SectionLabel>{heading}</SectionLabel>
                    {labels.map((label) => (
                      <NavItem key={label} icon={iconFor(label)} label={label} isActive={label === tab.activeLabel} />
                    ))}
                  </div>
                ))}
                <div>
                  <SectionLabel>Account</SectionLabel>
                  {ACCOUNT_LABELS.map((label) => (
                    <NavItem key={label} icon={iconFor(label)} label={label} />
                  ))}
                </div>
              </nav>

              <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg bg-surface-container-low px-2 py-2">
                <div className="w-8 h-8 rounded-full bg-sidebar-logo text-on-sidebar-logo shrink-0 flex items-center justify-center font-body-sm text-[11px] font-bold">
                  {tab.user.initials}
                </div>
                <div className="min-w-0">
                  <p className="font-body-sm text-[13px] font-semibold text-on-sidebar truncate leading-tight">
                    {tab.user.name}
                  </p>
                  <p className="font-body-sm text-[11px] text-on-sidebar-muted leading-tight">{tab.user.role}</p>
                </div>
              </div>
            </aside>

            {/* Top bar + page */}
            <div className="flex-1 min-w-0 flex flex-col">
              <div
                ref={inertRef}
                className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-outline-variant/50"
              >
                <span className="material-symbols-outlined text-on-surface shrink-0">menu</span>
                <p className="font-headline-md text-[20px] leading-7 font-bold text-primary truncate">{tab.title}</p>
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  <div className="hidden md:flex items-center gap-2 w-56 rounded-xl bg-surface-container px-3 py-1.5 text-on-surface-variant">
                    <span className="material-symbols-outlined text-[20px]">search</span>
                    <span className="font-body-sm text-body-sm truncate">Search courses, people, timesheets...</span>
                  </div>
                  <span className="material-symbols-outlined text-on-surface">dark_mode</span>
                  <span className="material-symbols-outlined text-on-surface rounded-lg border border-outline-variant p-1">
                    person
                  </span>
                </div>
              </div>

              <div
                id="preview-panel"
                role="tabpanel"
                aria-labelledby={`preview-tab-${tab.id}`}
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
              >
                {tab.id === "tutor" && (
                  <TutorDashboardContent
                    readOnly
                    firstName="Alex"
                    courses={TUTOR_COURSES}
                    sessions={tutorSessions}
                    maxHoursPerWeek={12}
                    weekScheduledHours={9}
                    formatTime={formatPreviewTime}
                  />
                )}

                {tab.id === "organiser" && (
                  <OrganiserBoardView
                    readOnly
                    courses={ORGANISER_COURSES}
                    selectedCourse={organiserCourse.id}
                    course={organiserCourse}
                    availableTutors={ORGANISER_AVAILABLE}
                    allocatedTutors={ORGANISER_ASSIGNED}
                  />
                )}

                {tab.id === "lecturer" && (
                  <div ref={inertRef}>
                    <TimesheetsContent isLecturer timesheets={LECTURER_TIMESHEETS} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}