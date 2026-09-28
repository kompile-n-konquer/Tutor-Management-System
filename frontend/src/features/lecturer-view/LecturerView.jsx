import { useCallback, useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout.jsx";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import api from "../../utils/axiosInstance.js";
import {
  formatSessionDate,
  formatSessionTimeRange,
  formatTimeRange,
} from "../../utils/formatSession.js";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const todayISO = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const slotLabel = (slot) =>
  `${DAY_NAMES[slot.dayOfWeek] ?? "Day"} · ${formatTimeRange(slot.timeSlot)}${
    slot.venue ? ` · ${slot.venue}` : ""
  }${slot.sessionType ? ` · ${slot.sessionType}` : ""}`;

// Chip + copy for the session states a lecturer cares about.
const sessionState = (session) => {
  switch (session.status) {
    case "UNASSIGNED":
      return {
        chip: "bg-urgent-orange/10 text-urgent-orange",
        label: "Excused — needs volunteer",
      };
    case "PENDING":
      return { chip: "bg-trust-blue/10 text-trust-blue", label: "Cover requested" };
    default:
      return { chip: "bg-surface-variant text-on-surface-variant", label: "Scheduled" };
  }
};

function CourseSection({ course, form, onFormChange, onSchedule, isSubmitting, formError, onDecision, decidingSessionId }) {
  const today = startOfToday().getTime();
  const upcoming = course.sessions.filter(
    (session) => new Date(session.date).getTime() >= today
  );
  const canSchedule = course.slots.length > 0 && course.tutors.length > 0;

  return (
    <section
      aria-label={`${course.courseCode} sessions`}
      className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit px-stack-lg py-stack-md border-b border-outline-variant">
        <span className="font-data-mono text-data-mono font-semibold text-primary">
          {course.courseCode}
        </span>
        <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0">
          {course.courseName}
        </span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {course.tutors.length === 0
            ? "No tutors assigned yet"
            : `${course.tutors.length} tutor${course.tutors.length === 1 ? "" : "s"}: ${course.tutors
                .map((tutor) => tutor.name)
                .join(", ")}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Scheduled sessions */}
        <div className="p-stack-lg lg:border-r border-outline-variant/60">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
            Scheduled sessions
          </h3>
          {upcoming.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              Nothing scheduled yet. Sessions you add appear on every assigned tutor's dashboard.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {upcoming.map((session) => {
                const state = sessionState(session);
                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit py-stack-sm"
                  >
                    <span className="font-data-mono text-data-mono text-on-surface w-24 shrink-0">
                      {formatSessionDate(session.date)}
                    </span>
                    <span className="font-data-mono text-data-mono text-on-surface-variant w-32 shrink-0">
                      {formatSessionTimeRange(session)}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0">
                      {session.tutorName ?? "Unassigned tutor"}
                    </span>
                    <span
                      className={`${state.chip} px-2 py-0.5 rounded font-label-caps text-label-caps`}
                    >
                      {state.label}
                    </span>
                    {session.excuseReason && (
                      <span className="font-body-sm text-body-sm text-outline italic basis-full">
                        “{session.excuseReason}”
                      </span>
                    )}
                    {session.volunteerRequest?.status === "PENDING" && (
                      <span className="basis-full flex flex-wrap items-center gap-x-stack-md gap-y-unit pt-unit">
                        <span className="font-body-sm text-body-sm text-on-surface">
                          Cover requested by {session.volunteerRequest.volunteerName ?? "a tutor"}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDecision(session.id, "APPROVED")}
                          disabled={decidingSessionId !== null}
                          className="cursor-pointer bg-primary text-on-primary rounded-lg px-3 py-1.5 font-label-caps text-label-caps uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {decidingSessionId === session.id ? "Working…" : "Approve cover"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDecision(session.id, "REJECTED")}
                          disabled={decidingSessionId !== null}
                          className="cursor-pointer border border-outline-variant text-on-surface-variant rounded-lg px-3 py-1.5 font-label-caps text-label-caps uppercase hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {decidingSessionId === session.id ? "Working…" : "Reject"}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Schedule form */}
        <div className="p-stack-lg bg-surface-container-low">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
            Schedule a session
          </h3>
          {!canSchedule ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              {course.slots.length === 0
                ? "This course has no weekly time slots yet — sessions are scheduled against the course timetable."
                : "Once the organiser assigns a tutor to this course, you can schedule sessions for them."}
            </p>
          ) : (
            <form
              onSubmit={(event) => onSchedule(event, course)}
              className="space-y-stack-md"
            >
              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                  Weekly slot
                </span>
                <select
                  value={form.courseSlotId}
                  onChange={(event) =>
                    onFormChange(course.id, "courseSlotId", event.target.value)
                  }
                  className="w-full border border-surface-variant rounded-DEFAULT p-stack-sm font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary"
                >
                  {course.slots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slotLabel(slot)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                  Tutor
                </span>
                <select
                  value={form.assignmentId}
                  onChange={(event) =>
                    onFormChange(course.id, "assignmentId", event.target.value)
                  }
                  className="w-full border border-surface-variant rounded-DEFAULT p-stack-sm font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary"
                >
                  {course.tutors.map((tutor) => (
                    <option key={tutor.assignmentId} value={tutor.assignmentId}>
                      {tutor.name} ({tutor.allocatedHours}h)
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                  Date
                </span>
                <input
                  type="date"
                  value={form.date}
                  min={todayISO()}
                  required
                  onChange={(event) => onFormChange(course.id, "date", event.target.value)}
                  className="w-full border border-surface-variant rounded-DEFAULT p-stack-sm font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary"
                />
              </label>

              {formError && <ErrorMessage>{formError}</ErrorMessage>}

              <Button type="submit" loading={isSubmitting}>
                Schedule session
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

export default function LecturerView() {
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [forms, setForms] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submittingCourseId, setSubmittingCourseId] = useState(null);
  const [decidingSessionId, setDecidingSessionId] = useState(null);

  const fetchLecturerCourses = useCallback(async () => {
    try {
      const response = await api.get("/sessions/lecturer");
      if (response.status !== 200) {
        setError(
          response.data?.message || "Could not load your courses. Please try again later."
        );
        return;
      }
      const loadedCourses = response.data?.courses ?? [];
      setCourses(loadedCourses);
      setForms((previous) => {
        const next = {};
        for (const course of loadedCourses) {
          next[course.id] = previous[course.id] ?? {
            courseSlotId: course.slots[0]?.id ?? "",
            assignmentId: course.tutors[0]?.assignmentId ?? "",
            date: "",
          };
        }
        return next;
      });
      setError("");
    } catch {
      setError("Could not load your courses. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wrapped so no state updates run synchronously inside the effect.
    (async () => {
      await fetchLecturerCourses();
    })();
  }, [fetchLecturerCourses]);

  const handleFormChange = (courseId, field, value) => {
    setForms((previous) => ({
      ...previous,
      [courseId]: { ...previous[courseId], [field]: value },
    }));
    setFormErrors((previous) => ({ ...previous, [courseId]: "" }));
  };

  const handleSchedule = async (event, course) => {
    event.preventDefault();
    const form = forms[course.id] ?? {};

    if (!form.courseSlotId || !form.assignmentId || !form.date) {
      setFormErrors((previous) => ({
        ...previous,
        [course.id]: "Choose a weekly slot, a tutor and a date.",
      }));
      return;
    }

    setSubmittingCourseId(course.id);
    setFormErrors((previous) => ({ ...previous, [course.id]: "" }));

    try {
      const response = await api.post("/sessions", {
        assignmentId: Number(form.assignmentId),
        courseSlotId: Number(form.courseSlotId),
        date: form.date,
      });
      if (response.status !== 201) {
        setFormErrors((previous) => ({
          ...previous,
          [course.id]:
            response.data?.message || "Could not schedule the session. Please try again.",
        }));
        return;
      }
      // The new session lands in the list after the refetch.
      setForms((previous) => ({
        ...previous,
        [course.id]: { ...previous[course.id], date: "" },
      }));
      await fetchLecturerCourses();
    } catch {
      setFormErrors((previous) => ({
        ...previous,
        [course.id]: "Could not schedule the session. Please try again.",
      }));
    } finally {
      setSubmittingCourseId(null);
    }
  };

  const handleVolunteerDecision = async (sessionId, decision) => {
    setDecidingSessionId(sessionId);
    setError("");

    try {
      const response = await api.patch(`/sessions/${sessionId}/volunteer`, { decision });
      if (response.status !== 200) {
        setError(response.data?.message || "Could not update the cover request. Please try again.");
        return;
      }
      // Approval re-assigns the session and rejection reopens it — refetch for both.
      await fetchLecturerCourses();
    } catch {
      setError("Could not update the cover request. Please try again.");
    } finally {
      setDecidingSessionId(null);
    }
  };

  return (
    <AppLayout title="Lecturer View">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        <header className="mb-stack-lg">
          <h1 className="font-display text-display text-on-surface">Your courses &amp; sessions</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-unit">
            Schedule tutoring sessions against your course timetable — every session appears on the
            dashboards of the tutors assigned to that course.
          </p>
        </header>

        {error && (
          <div className="mb-stack-lg">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {isLoading ? (
          <div className="animate-pulse space-y-gutter">
            <div className="h-40 bg-surface-container-low border border-outline-variant/40 rounded-xl" />
            <div className="h-40 bg-surface-container-low border border-outline-variant/40 rounded-xl" />
          </div>
        ) : courses.length === 0 ? (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-unit">
              No courses yet
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              You do not own any courses yet. Courses appear here once they are registered against
              your lecturer profile.
            </p>
          </section>
        ) : (
          <div className="space-y-gutter">
            {courses.map((course) => (
              <CourseSection
                key={course.id}
                course={course}
                form={forms[course.id] ?? { courseSlotId: "", assignmentId: "", date: "" }}
                onFormChange={handleFormChange}
                onSchedule={handleSchedule}
                isSubmitting={submittingCourseId === course.id}
                formError={formErrors[course.id]}
                onDecision={handleVolunteerDecision}
                decidingSessionId={decidingSessionId}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
