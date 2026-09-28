// Single source of truth for sidebar links, keyed by role.
// Add a route here once its page exists and it will appear for the right role(s) automatically.
// "roles" controls who sees the link; "to" must match a <Route path> in Router.jsx.

export const NAV_LINKS = [
  { to: "/tutor-dashboard", icon: "assignment_ind", label: "Tutor Dashboard", roles: ["tutor"] },
  { to: "/courses", icon: "menu_book", label: "Courses", roles: ["lecturer", "organiser"] },
  { to: "/events", icon: "calendar_today", label: "Events", roles: ["tutor", "lecturer", "organiser"] },
  { to: "/applications", icon: "workspace_premium", label: "Applications", roles: ["student", "tutor"] },
  { to: "/volunteer", icon: "volunteer_activism", label: "Volunteer View", roles: ["tutor"] },
  { to: "/timesheets", icon: "history_edu", label: "Timesheets", roles: ["organiser", "tutor", "lecturer"] },
  { to: "/timetable/edit", icon: "calendar_month", label: "Timetable", roles: ["tutor", "student"]  },

  // Not yet built — flagged in the page-to-role mapping phase as a structural gap:
  // { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"] },
  { to: "/organiser", icon: "dashboard", label: "Organiser Board", roles: ["organiser"] },
  { to: "/application-review", icon: "fact_check", label: "Applications", roles: ["organiser"] },
  { to: "/organiser-analytics", icon: "analytics", label: "Analytics", roles: ["organiser"] },
  { to: "/onboarding", icon: "upgrade", label: "Become a Tutor/Lecturer", roles: ["student"] },
  { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"] },
  { to: "/admin-view", icon: "admin_panel_settings", label: "Admin View", roles: ["admin"] },
];

export const FOOTER_LINKS = [
  { to: "/settings", icon: "settings", label: "Settings" },
  { to: "/", icon: "logout", label: "Logout" },
];

export function getNavLinksForRole(role) {
  if (!role) return [];
  return NAV_LINKS.filter((link) => link.roles.includes(role.toLowerCase()));
}
