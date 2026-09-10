// Single source of truth for sidebar links, keyed by role.
// Add a route here once its page exists and it will appear for the right role(s) automatically.
// "roles" controls who sees the link; "to" must match a <Route path> in Router.jsx.

export const NAV_LINKS = [
  { to: "/tutor-dashboard", icon: "assignment_ind", label: "Tutor Dashboard", roles: ["tutor"] },
  { to: "/organiser", icon: "dashboard", label: "Organiser Board", roles: ["organiser"] },
  { to: "/application-review", icon: "fact_check", label: "Applications", roles: ["organiser"] },
  { to: "/organiser-analytics", icon: "analytics", label: "Analytics", roles: ["organiser"] },
  { to: "/volunteer", icon: "volunteer_activism", label: "Volunteer View", roles: ["tutor", "student"] },
  { to: "/onboarding", icon: "upgrade", label: "Become a Tutor/Lecturer", roles: ["student"] },
  { to: "/profile", icon: "account_circle", label: "Profile", roles: ["tutor", "organiser", "lecturer", "admin", "student"] },
  { to: "/timesheets", icon: "history_edu", label: "Timesheets", roles: ["tutor", "organiser"] },
  { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"] },
  { to: "/admin-view", icon: "admin_panel_settings", label: "Admin View", roles: ["admin"] },
];

export const FOOTER_LINKS = [
  { to: "/settings", icon: "settings", label: "Settings" },
  { to: "/", icon: "logout", label: "Logout" },
];

export function getNavLinksForRole(role) {
  return NAV_LINKS.filter((link) => link.roles.includes(role));
}
