import { COURSES, TUTORS, TIMESHEETS } from "../data/mockData";

// Flattens all three entity types into one list the search bar can filter over.
// Each entry knows where clicking it should navigate to.
export function buildSearchIndex() {
  const courseEntries = COURSES.map((c) => ({
    type: "course",
    id: c.code,
    title: c.code,
    subtitle: c.name,
    to: "/organiser",
  }));

  const analyticsEntries = COURSES.map((c) => ({
    type: "analytics",
    id: `analytics-${c.code}`,
    title: `${c.code} Analytics`,
    subtitle: `Hours & budget for ${c.name}`,
    to: "/organiser-analytics",
  }));

  const peopleEntries = TUTORS.map((t) => ({
    type: "person",
    id: t.id,
    title: t.name,
    subtitle: t.clash ? "Schedule clash" : t.verified ? "Verified tutor" : "Tutor",
    to: "/profile",
  }));

  const timesheetEntries = TIMESHEETS.map((ts) => ({
    type: "timesheet",
    id: ts.id,
    title: `${ts.tutorName} — ${ts.courseCode}`,
    subtitle: `${ts.hours}h · ${ts.weekOf} · ${ts.status}`,
    to: "/timesheets",
  }));

  return [...courseEntries, ...analyticsEntries, ...peopleEntries, ...timesheetEntries];
}

export function searchAll(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return buildSearchIndex().filter(
    (entry) => entry.title.toLowerCase().includes(q) || entry.subtitle.toLowerCase().includes(q)
  );
}