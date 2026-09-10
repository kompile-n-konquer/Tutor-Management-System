// Single source of truth for sidebar links, keyed by role.
// Add a route here once its page exists and it will appear for the right role(s) automatically.
// "roles" controls who sees the link; "to" must match a <Route path> in App.jsx.

export const NAV_LINKS = [
  { to: "/courses/add", icon: "menu_book", label: "Courses", roles: ["lecturer", "organiser"] },
  { to: "/allocation-board", icon: "dashboard", label: "Allocation Board", roles: ["organiser"] },
  { to: "/tutor-dashboard", icon: "assignment_ind", label: "Tutor Dashboard", roles: ["tutor"] },
  { to: "/volunteer", icon: "volunteer_activism", label: "Volunteer View", roles: ["tutor", "student"] },
  { to: "/profile", icon: "account_circle", label: "Profile", roles: ["organiser", "tutor", "student", "lecturer"] },
  { to: "/timesheets", icon: "history_edu", label: "Timesheets", roles: ["organiser", "tutor", "lecturer"] },
  { to: "/timetable/edit", icon: "calendar_month", label: "Timetable", roles: ["tutor", "student"]  },

  // Not yet built — flagged in the page-to-role mapping phase as a structural gap:
  // { to: "/lecturer-view", icon: "school", label: "Lecturer View", roles: ["lecturer"] },
];

export const FOOTER_LINKS = [
  { to: "/settings", icon: "settings", label: "Settings" },
  { to: "/", icon: "logout", label: "Logout" },
];

export function getNavLinksForRole(role) {
  return NAV_LINKS.filter((link) => link.roles.includes(role.toLowerCase()));
}