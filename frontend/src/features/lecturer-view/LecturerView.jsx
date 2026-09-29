import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import { minutesToLabel } from "../../components/slot-grid/SlotGrid.jsx";
import api from "../../utils/axiosInstance.js";
import { formatSessionDate, formatSessionTimeRange } from "../../utils/formatSession.js";

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

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

function CourseSection({ course, onDecided }) {
  const [decidingSessionId, setDecidingSessionId] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  const today = startOfToday().getTime();
  // Events are the schedule: each one derives a session for every assigned
  // tutor from the course's slots on that weekday. Session rows only exist
  // once a tutor excuses themselves or a student volunteers — those are the
  // follow-ups on the right.
  const followUps = course.sessions.filter(
    (session) => new Date(session.date).getTime() >= today
  );

  // Approve/reject a pending cover request; the parent refetches so the
  // session state and tutor lists reflect the decision immediately.
  const handleDecision = async (sessionId, decision) => {
    setDecidingSessionId(sessionId);
    setDecisionError("");
    try {
      const response = await api.patch(`/sessions/${sessionId}/volunteer`, { decision });
      if (response.status !== 200) {
        setDecisionError(
          response.data?.message || "Could not update the cover request. Please try again later."
        );
        return;
      }
      await onDecided?.();
    } catch {
      setDecisionError("Could not update the cover request. Please try again later.");
    } finally {
      setDecidingSessionId(null);
    }
  };

  return (
    <section
      aria-label={`${course.courseCode} sessions`}
      className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit px-stack-lg py-stack-md border-b border-outline-variant">
        <span className="font-data-mono text-data-mono font-semibold text-primary">
          {course.courseCode}
        </span>
        <span className="font-body-md text-body-md text-on-surface flex-1 min-w-[12rem] break-words">
          {course.courseName}
        </span>
        <span className="font-body-sm text-body-sm text-on-surface-variant min-w-0 break-words">
          {course.tutors.length === 0
            ? "No tutors assigned yet"
            : `${course.tutors.length} tutor${course.tutors.length === 1 ? "" : "s"}: ${course.tutors
                .map((tutor) => tutor.name)
                .join(", ")}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Upcoming events — the course's tutoring schedule */}
        <div className="p-stack-lg lg:border-r border-outline-variant/60">
          <div className="flex items-baseline justify-between gap-stack-md mb-stack-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              Upcoming events
            </h3>
            <Link
              to="/events/add"
              className="font-label-caps text-label-caps text-primary underline-offset-2 hover:underline"
            >
              Add event
            </Link>
          </div>
          {course.events.length === 0 ? (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No upcoming events. Every event you add becomes a session on each assigned tutor's
              dashboard.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {course.events.map((event) => (
                <li key={event.id}>
                  <Link
                    to={`/events/${event.id}`}
                    className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit py-stack-sm hover:bg-surface-container-low transition-colors"
                  >
                    <span className="font-data-mono text-data-mono text-on-surface w-24 shrink-0">
                      {formatSessionDate(event.date)}
                    </span>
                    {event.times.length > 0 ? (
                      <span className="flex flex-wrap gap-1 min-w-0">
                        {event.times.map((time, index) => (
                          <span
                            key={`${event.id}-${index}`}
                            className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                          >
                            {minutesToLabel(time.startMinute)}-{minutesToLabel(time.endMinute)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-outline text-sm">No timeslot on this weekday</span>
                    )}
                    <span className="font-body-md text-body-md text-on-surface flex-1 min-w-[12rem] break-words capitalize">
                      {event.description}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Session follow-ups — the excuse / volunteer lifecycle */}
        <div className="p-stack-lg bg-surface-container-low">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
            Session follow-ups
          </h3>
          {followUps.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              No follow-ups. Sessions appear here once a tutor excuses themselves or a student
              volunteers to cover one.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/50">
              {followUps.map((session) => {
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
                    <span className="font-body-md text-body-md text-on-surface flex-1 min-w-[8rem] break-words">
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
                          onClick={() => handleDecision(session.id, "APPROVED")}
                          disabled={decidingSessionId !== null}
                          className="cursor-pointer bg-primary text-on-primary rounded-lg px-3 py-1.5 font-label-caps text-label-caps uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {decidingSessionId === session.id ? "Working…" : "Approve cover"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDecision(session.id, "REJECTED")}
                          disabled={decidingSessionId !== null}
                          className="cursor-pointer border border-outline-variant text-on-surface-variant rounded-lg px-3 py-1.5 font-label-caps text-label-caps uppercase hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {decidingSessionId === session.id ? "Working…" : "Reject"}
                        </button>
                        {decisionError && (
                          <span className="basis-full font-body-sm text-body-sm text-urgent-orange">
                            {decisionError}
                          </span>
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
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

  const fetchLecturerCourses = useCallback(async () => {
    try {
      const response = await api.get("/sessions/lecturer");
      if (response.status !== 200) {
        setError(
          response.data?.message || "Could not load your courses. Please try again later."
        );
        return;
      }
      setCourses(response.data?.courses ?? []);
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

  return (
    <AppLayout title="Lecturer View">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        <header className="mb-stack-lg">
          <h1 className="font-display text-display text-on-surface">Your courses &amp; sessions</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-unit">
            Every event you add becomes a session for each tutor assigned to that course — their
            dashboards update automatically.
          </p>
        </header>

        {error && (
          <div className="mb-stack-lg">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-gutter" aria-hidden="true">
            {[0, 1].map((card) => (
              <div
                key={card}
                className="animate-pulse bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
              >
                <div className="flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-lg py-stack-md border-b border-outline-variant">
                  <div className="h-4 w-20 rounded bg-surface-container-high" />
                  <div className="h-4 w-44 rounded bg-surface-container-high" />
                  <div className="h-4 w-28 rounded bg-surface-container-high" />
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="p-stack-lg space-y-stack-md lg:border-r border-outline-variant/60">
                    <div className="h-4 w-32 rounded bg-surface-container-high" />
                    <div className="h-5 rounded bg-surface-container-high/60" />
                    <div className="h-5 rounded bg-surface-container-high/60" />
                    <div className="h-5 rounded bg-surface-container-high/60" />
                  </div>
                  <div className="p-stack-lg bg-surface-container-low space-y-stack-md">
                    <div className="h-4 w-36 rounded bg-surface-container-high" />
                    <div className="h-5 rounded bg-surface-container-high/60" />
                    <div className="h-5 rounded bg-surface-container-high/60" />
                  </div>
                </div>
              </div>
            ))}
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
              <CourseSection key={course.id} course={course} onDecided={fetchLecturerCourses} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
