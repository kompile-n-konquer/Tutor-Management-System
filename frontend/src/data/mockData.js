// Single shared data source for the whole app — the search bar, Organiser Board,
// Analytics, and Timesheets page all read from here so a tutor's name/course
// stays consistent across every screen instead of each page inventing its own
// fake data.

export const COURSES = [
  { code: "CS101", name: "Intro to Programming", req: 5, budget: 40, rate: 150 },
  { code: "MATH202", name: "Discrete Mathematics", req: 2, budget: 20, rate: 160 },
  { code: "CS305", name: "Database Systems", req: 4, budget: 35, rate: 155 },
];

export const TUTORS = [
  { id: "t1", name: "Alex Mercer", rating: 4.8, hoursLeft: 15, verified: true, clash: false, courseCode: null },
  { id: "t2", name: "Sarah Jenkins", rating: 4.5, hoursLeft: 2, verified: true, clash: false, courseCode: null },
  { id: "t3", name: "David Kim", rating: 4.9, hoursLeft: 8, verified: true, clash: true, courseCode: "CS101" },
  { id: "t4", name: "Priya Nair", rating: 4.6, hoursLeft: 10, verified: true, clash: false, courseCode: "CS101" },
  { id: "t5", name: "Marcus Webb", rating: 4.2, hoursLeft: 6, verified: false, clash: false, courseCode: "CS305" },
];

export const TIMESHEETS = [
  { id: "ts1", tutorName: "Alex Mercer", courseCode: "CS101", hours: 12.5, weekOf: "Oct 12", status: "pending" },
  { id: "ts2", tutorName: "Sarah Jenkins", courseCode: "MATH202", hours: 6, weekOf: "Oct 12", status: "pending" },
  { id: "ts3", tutorName: "David Kim", courseCode: "CS305", hours: 9.5, weekOf: "Oct 12", status: "pending" },
  { id: "ts4", tutorName: "Priya Nair", courseCode: "CS101", hours: 10, weekOf: "Oct 5", status: "approved" },
];