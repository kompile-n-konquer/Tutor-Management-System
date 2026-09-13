import { TUTORS, TIMESHEETS } from "../data/mockData";

// Flattens all entity types into one list the search bar can filter over.
// `courses` is passed in (fetched from the API by GlobalSearch) so we stay
// decoupled from the mock data source.
export function buildSearchIndex(courses = []) {
  const courseEntries = courses.map((c) => ({
    type: "course",
    id: c.code,
    title: c.code,
    subtitle: c.name,
    to: "/organiser",
  }));

  const analyticsEntries = courses.map((c) => ({
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

export function searchAll(query, courses = []) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return buildSearchIndex(courses).filter(
    (entry) => entry.title.toLowerCase().includes(q) || entry.subtitle.toLowerCase().includes(q)
  );
}