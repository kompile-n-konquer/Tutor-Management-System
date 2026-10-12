// Where each dashboard item type leads. The backend's GET /api/dashboard
// describes WHAT needs attention; this map decides where the item's action
// link takes the user. A `to` starting with "#" is an in-page anchor — the
// action sits on the dashboard itself, below the priority panel.

export const ALERT_ACTIONS = {
  // Tutor items
  "swap-incoming": { to: "/swaps", actionLabel: "Respond" },
  "swap-outgoing": { to: "/swaps", actionLabel: "View swaps" },
  "swap-accepted": { to: "/swaps", actionLabel: "View swaps" },
  "cover-awaiting": { to: "/cover", actionLabel: "Find cover" },
  "cover-offered": { to: "/cover", actionLabel: "View offer" },
  "timesheet-rejected": { to: "/timesheets", actionLabel: "Fix timesheet" },
  "timesheet-draft": { to: "/timesheets", actionLabel: "Submit hours" },
  // Lecturer items — cover decisions are made on the dashboard itself
  "cover-decision": { to: "#lecturer-courses", actionLabel: "Decide below" },
  "timesheet-review": { to: "/timesheets", actionLabel: "Review" },
  // Organiser / admin items
  "understaffed-course": { to: "/organiser", actionLabel: "Open allocation" },
  "unassigned-session": { to: "/organiser", actionLabel: "Open allocation" },
  "swap-review": { to: "/swap-review", actionLabel: "Review swaps" },
  "role-application": { to: "/application-review", actionLabel: "Review" },
  "course-application": { to: "/application-review", actionLabel: "Review" },
};

export function alertActionFor(type) {
  return ALERT_ACTIONS[type] ?? null;
}

// "just now" / "5m ago" / "3h ago" / "2d ago" — the feed is about freshness,
// so items speak in relative terms. Past a week (or for future timestamps
// like an upcoming session date) the plain locale date reads better.
export function formatAlertTime(at, now = Date.now()) {
  if (!at) return "";
  const time = new Date(at).getTime();
  if (Number.isNaN(time)) return "";

  const elapsed = now - time;
  if (elapsed < 0) return new Date(time).toLocaleDateString();
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)}d ago`;
  return new Date(time).toLocaleDateString();
}
