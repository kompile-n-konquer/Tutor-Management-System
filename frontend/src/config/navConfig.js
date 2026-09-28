// Single source of truth for sidebar links, keyed by role.
// Add a route here once its page exists and it will appear for the right role(s) automatically.
// "roles" controls who sees the link; "to" must match a <Route path> in Router.jsx.
// "section" groups the link under a sidebar heading ("main" = Main Menu, "general" = General).

export const NAV_LINKS = [
  { to: "/tutor-dashboard", icon: "assignment_ind", label: "Tutor Dashboard", roles: ["tutor"], section: "main" },
  { to: "/courses", icon: "menu_book", label: "Courses", roles: ["lecturer", "organiser"], section: "general" },
  { to: "/events", icon: "calendar_today", label: "Events", roles: ["tutor", "lecturer", "organiser"], section: "general" },
  { to: "/applications", icon: "workspace_premium", label: "Applications", roles: ["student", "tutor"], section: "general" },
  { to: "/volunteer", icon: "volunteer_activism", label: "Volunteer View", roles: ["tutor"], section: "general" },
  { to: "/timesheets", icon: "history_edu", label: "Timesheets", roles: ["organiser", "tutor", "lecturer"], section: "general" },
  { to: "/timetable/edit", icon: "calendar_month", label: "Timetable", roles: ["tutor", "student"], section: "general" },

  // Not yet built — flagged in the page-to-role mapping phase as a structural gap:
  // { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"] },
  { to: "/organiser", icon: "dashboard", label: "Organiser Board", roles: ["organiser"], section: "main" },
  { to: "/application-review", icon: "fact_check", label: "Applications", roles: ["organiser"], section: "general" },
  { to: "/organiser-analytics", icon: "analytics", label: "Analytics", roles: ["organiser"], section: "main" },
  { to: "/onboarding", icon: "upgrade", label: "Become a Tutor/Lecturer", roles: ["student"], section: "general" },
  { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"], section: "main" },
  { to: "/admin-view", icon: "admin_panel_settings", label: "Admin View", roles: ["admin"], section: "main" },
];

// Rendered under the Account heading at the bottom of the sidebar. "Logout" is
// an action (sign-out), everything else navigates like a normal link.
export const FOOTER_LINKS = [
  { to: "/profile", icon: "person", label: "Profile" },
  { to: "/settings", icon: "settings", label: "Settings" },
  { to: "/", icon: "logout", label: "Logout" },
];

export function getNavLinksForRole(role) {
  if (!role) return [];
  return NAV_LINKS.filter((link) => link.roles.includes(role.toLowerCase()));
}
