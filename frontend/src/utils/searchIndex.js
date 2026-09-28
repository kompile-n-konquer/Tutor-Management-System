import { TUTORS, TIMESHEETS } from "../data/mockData";

// Flattens all entity types into one list the search bar can filter over.
// `courses` is passed in (fetched from the API by GlobalSearch) so we stay
// decoupled from the mock data source.
//
// Every group is scoped to what the signed-in role may actually open, so the
// search never recommends a page or data the user is not authorized to see:
// students and tutors only ever see the courses they can apply for, lecturers
// see the course registry, and the organiser-only groups (analytics, tutor
// roster, timesheet queue) never surface for anyone else.
export function buildSearchIndex(courses = [], role = null) {
  const normalizedRole = (role || "").toLowerCase();

  // Course results open the page the role can reach: lecturers open the
  // course's details page, applicants open its application opportunity and
  // organisers land on their allocation board.
  const courseTo = (course) => {
    if (normalizedRole === "lecturer") return `/courses/${course.id}`;
    if (normalizedRole === "student" || normalizedRole === "tutor") return `/applications/${course.id}`;
    return "/organiser";
  };

  const courseEntries = courses.map((c) => ({
    type: "course",
    id: c.code,
    title: c.code,
    subtitle: c.name,
    to: courseTo(c),
  }));

  // Analytics, the tutor roster and the timesheet queue belong to the
  // organiser's management pages — nobody else may open them.
  const isOrganiser = normalizedRole === "organiser" || normalizedRole === "admin";
  if (!isOrganiser) {
    return courseEntries;
  }

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

export function searchAll(query, courses = [], role = null) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return buildSearchIndex(courses, role).filter(
    (entry) => entry.title.toLowerCase().includes(q) || entry.subtitle.toLowerCase().includes(q)
  );
}
