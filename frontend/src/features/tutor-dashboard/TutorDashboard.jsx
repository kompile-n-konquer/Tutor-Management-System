import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout.jsx";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import OnboardingWalkthrough from "../../components/onboarding/OnboardingWalkthrough.jsx";
import useAuth from "../../hooks/useAuth.js";
import { useFirstVisit } from "../../hooks/useFirstVisit.js";
import api from "../../utils/axiosInstance.js";
import { formatSessionTimeRange } from "../../utils/formatSession.js";

const TUTOR_ONBOARDING_STEPS = [
  {
    title: "Your courses, front and centre",
    body: "The courses you were assigned to tutor are listed at the top — every session on this page belongs to one of them.",
  },
  {
    title: "Your session ledger",
    body: "Sessions derived from your courses' events, grouped by day — only your own sessions appear here.",
  },
  {
    title: "Can't make a session?",
    body: "Use “Excuse myself” on a session you lead. Give a reason and the session opens for student volunteers to cover.",
  },
  {
    title: "Pick up more hours",
    body: "When a tutor excuses themselves, the session needs cover. Find those sessions in the Volunteer View.",
  },
];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

// "Today" / "Tomorrow" / "Monday 21 Sep" — used for both day headings and the
// next-session block, so the whole page speaks one date language.
const dayHeading = (value) => {
  const diff = Math.round(
    (startOfDay(value).getTime() - startOfDay(new Date()).getTime()) / MILLISECONDS_PER_DAY
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
};

const sessionSlotMeta = (session) =>
  [session.courseSlot?.venue, session.courseSlot?.sessionType].filter(Boolean).join(" · ");

// SCHEDULED sessions carry no state chip — the "You lead" line is their status.
// Only excused, offered and volunteered sessions get a chip.
const stateChipFor = (session) => {
  if (session.status === "UNASSIGNED") {
    return { className: "bg-urgent-orange/10 text-urgent-orange", label: "Excused — awaiting volunteer" };
  }
  if (session.status === "OFFERED") {
    return { className: "bg-secondary-fixed text-on-secondary-container", label: "Cover offer sent" };
  }
  if (session.status === "PENDING") {
    return { className: "bg-trust-blue/10 text-trust-blue", label: "Volunteer pending" };
  }
  return null;
};

function SessionRow({ session, isExcusing, onExcuse, onCancel, onSubmit, isSubmitting }) {
  const chip = stateChipFor(session);
  const slotMeta = sessionSlotMeta(session);

  return (
    <li className="border-l-[3px] border-primary bg-surface-container-lowest">
      <div className="flex flex-wrap items-start gap-x-stack-md gap-y-unit px-stack-md py-stack-md">
        <div className="w-28 shrink-0">
          <p className="font-data-mono text-data-mono text-on-surface">
            {formatSessionTimeRange(session)}
          </p>
          {slotMeta && (
            <p className="font-body-sm text-body-sm text-outline mt-unit">{slotMeta}</p>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-body-md text-body-md text-on-surface">
            <span className="font-data-mono font-semibold text-primary">
              {session.course?.courseCode ?? "Session"}
            </span>
            <span className="text-on-surface-variant"> — {session.course?.courseName}</span>
          </p>

          <div className="mt-unit flex flex-wrap items-center gap-x-stack-sm gap-y-unit">
            {session.status === "SCHEDULED" && (
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-label-caps text-label-caps">
                You lead
              </span>
            )}

            {chip && (
              <span className={`${chip.className} px-2 py-0.5 rounded font-label-caps text-label-caps`}>
                {chip.label}
              </span>
            )}

            {session.excuseReason && (
              <span className="font-body-sm text-body-sm text-on-surface-variant italic">
                “{session.excuseReason}”
              </span>
            )}
          </div>
        </div>

        {session.status === "SCHEDULED" && !isExcusing && (
          <button
            type="button"
            onClick={() => onExcuse(session.id)}
            className="ml-auto shrink-0 font-label-caps text-label-caps text-urgent-orange underline-offset-2 hover:underline"
          >
            Excuse myself
          </button>
        )}
      </div>

      {isExcusing && (
        <div className="border-t border-outline-variant/60 bg-surface-container-low px-stack-md py-stack-md">
          <form onSubmit={(event) => onSubmit(event, session.id)} className="max-w-xl space-y-stack-sm">
            <label
              htmlFor={`excuse-reason-${session.id}`}
              className="font-label-caps text-label-caps text-on-surface-variant block"
            >
              Reason for excusing yourself from this session
            </label>
            <textarea
              id={`excuse-reason-${session.id}`}
              value={session.draftReason ?? ""}
              onChange={(event) => onExcuse(session.id, event.target.value)}
              rows={2}
              required
              autoFocus
              placeholder="e.g. Medical appointment I could not move"
              className="w-full border border-surface-variant rounded-DEFAULT p-stack-sm font-body-sm text-body-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary"
            />
            <div className="flex gap-stack-sm max-w-sm">
              <Button type="submit" loading={isSubmitting}>
                Confirm excuse
              </Button>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-3 rounded-DEFAULT font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

export default function TutorDashboard() {
  const { userProfile, currentUser, loading: authLoading } = useAuth();
  const { isFirstVisit, markSeen } = useFirstVisit("tutor-dashboard");
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [maxHoursPerWeek, setMaxHoursPerWeek] = useState(null);
  const [weekScheduledHours, setWeekScheduledHours] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [excusingSessionId, setExcusingSessionId] = useState(null);
  const [excuseReason, setExcuseReason] = useState("");
  const [isExcusing, setIsExcusing] = useState(false);
  // Success note shown once an excuse lands, with the jump to Cover Requests.
  const [excuseSuccess, setExcuseSuccess] = useState(null);

  const fetchMySessions = useCallback(async () => {
    try {
      const response = await api.get("/sessions/mine");
      if (response.status !== 200) {
        setLoadError(response.data?.message || "Could not load your sessions. Please try again later.");
        return;
      }
      setCourses(response.data?.courses ?? []);
      // The API scopes this feed to the tutor's own sessions; the filter keeps
      // that invariant in the component so no foreign row can ever render.
      setSessions((response.data?.sessions ?? []).filter((session) => session.isMine));
      setMaxHoursPerWeek(response.data?.maxHoursPerWeek ?? null);
      setWeekScheduledHours(response.data?.weekScheduledHours ?? 0);
      setError("");
      setLoadError("");
    } catch {
      setLoadError("Could not load your sessions. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for Firebase to restore the session before the first fetch — the
    // axios interceptor reads auth.currentUser at request time and would
    // otherwise send the request without a token (401 on hard refresh).
    // (uid, not the user object — enrichment rebuilds the object identity).
    if (authLoading || !currentUser?.uid) return;
    // Wrapped so no state updates run synchronously inside the effect.
    (async () => {
      await fetchMySessions();
    })();
  }, [authLoading, currentUser?.uid, fetchMySessions]);

  const startExcuse = (sessionId, reason = "") => {
    setExcusingSessionId(sessionId);
    setExcuseReason(reason);
    setError("");
    setExcuseSuccess(null);
  };

  const cancelExcuse = () => {
    setExcusingSessionId(null);
    setExcuseReason("");
    setError("");
    setExcuseSuccess(null);
  };

  const handleExcuse = async (event, sessionId) => {
    event.preventDefault();

    const reason = excuseReason.trim();
    if (!reason) {
      setError("Please provide a reason for excusing yourself.");
      return;
    }

    setIsExcusing(true);
    setError("");

    try {
      const response = await api.patch(`/sessions/${sessionId}/excuse`, { reason });
      if (response.status !== 200) {
        setError(response.data?.message || "Could not submit your excuse. Please try again later.");
        return;
      }
      // The session is now UNASSIGNED — reload so its excuse status is reflected.
      cancelExcuse();
      setExcuseSuccess("Session excused — it is now open for cover.");
      await fetchMySessions();
    } catch {
      setError("Could not submit your excuse. Please try again later.");
    } finally {
      setIsExcusing(false);
    }
  };

  // ── Derived schedule data ──────────────────────────────────────────
  // Sessions the API returns are already scoped to the tutor's own sessions
  // and sorted by date; everything below is presentation.
  const todayStart = startOfDay(new Date()).getTime();

  const upcomingGroups = useMemo(() => {
    const groups = [];
    for (const session of sessions) {
      const day = startOfDay(session.date).getTime();
      if (day < todayStart) continue; // the ledger is about what's ahead
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.day === day) {
        lastGroup.sessions.push(session);
      } else {
        groups.push({ day, date: new Date(session.date), sessions: [session] });
      }
    }
    return groups;
  }, [sessions, todayStart]);

  const upcomingCount = upcomingGroups.reduce((sum, group) => sum + group.sessions.length, 0);
  const sessionsToLead = upcomingGroups.reduce(
    (sum, group) => sum + group.sessions.filter((s) => s.status === "SCHEDULED").length,
    0
  );
  const nextSessionToLead = upcomingGroups
    .flatMap((group) => group.sessions)
    .find((session) => session.status === "SCHEDULED");
  const nextSessionMeta = nextSessionToLead ? sessionSlotMeta(nextSessionToLead) : null;
  const coverNeededCount = upcomingGroups
    .flatMap((group) => group.sessions)
    .filter((session) => session.status === "UNASSIGNED").length;

  // The backend sums the teaching week in focus server-side
  // (weekScheduledHours) — the week of the tutor's next still-scheduled
  // session, or the current week when nothing is ahead — matching the course
  // rows, past days included. Only sessions the tutor still leads count, so
  // excusing one lowers the card immediately. maxHoursPerWeek is the approved
  // application's cap, or the organiser's Max Claimable Hours setting when no
  // approved application carries hours; the bar shows how much of it the
  // week's sessions use, and turns orange once they exceed it. With neither
  // on file the card shows the hours alone instead of an empty bar against
  // "—"h.
  const hasWeeklyCap = maxHoursPerWeek > 0;
  const weekBarPercent =
    hasWeeklyCap ? Math.min(100, Math.round((weekScheduledHours / maxHoursPerWeek) * 100)) : 0;
  const isOverWeeklyCap = hasWeeklyCap && weekScheduledHours > maxHoursPerWeek;

  const firstName = userProfile?.firstName;
  const courseCodes = courses.map((course) => course.courseCode);

  return (
    <AppLayout title="Tutor Dashboard">
      {isFirstVisit && <OnboardingWalkthrough steps={TUTOR_ONBOARDING_STEPS} onDismiss={markSeen} />}

      <div className="p-margin-page max-w-container-max mx-auto w-full">
        {/* ── Course context — what this tutor is approved to teach ── */}
        <header className="mb-stack-lg">
          <p className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-unit">
            Tutor Dashboard
          </p>
          <h1 className="font-display text-display text-on-surface">
            {firstName ? `${firstName}'s tutoring schedule` : "Your tutoring schedule"}
          </h1>
        </header>

        {error && (
          <div className="mb-stack-lg">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {/* Load failures stand alone — the empty state must never render
            alongside them or it reads as "no assignments" when the load
            actually failed. Excuse/validation errors keep using `error`. */}
        {loadError && (
          <div className="mb-stack-lg flex flex-wrap items-center gap-stack-md">
            <div className="flex-1 min-w-64">
              <ErrorMessage>{loadError}</ErrorMessage>
            </div>
            <Button
              onClick={() => {
                setIsLoading(true);
                setLoadError("");
                fetchMySessions();
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-gutter" aria-hidden="true">
            {[0, 1].map((card) => (
              <div
                key={card}
                className="animate-pulse bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
              >
                <div className="px-stack-lg py-stack-md border-b border-outline-variant/60">
                  <div className="h-4 w-44 rounded bg-surface-container-high" />
                </div>
                <div className="px-stack-lg py-stack-md space-y-stack-md">
                  <div className="h-4 rounded bg-surface-container-high/60" />
                  <div className="h-4 rounded bg-surface-container-high/60" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? null : courses.length === 0 ? (
          <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-unit">
              No course assignments yet
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
              You are not currently assigned to tutor any courses. Once the organiser assigns you to
              a course you applied for, its details and every session derived from its events will
              appear here.
            </p>
          </section>
        ) : (
          <>
            <section
              aria-label="Courses you tutor"
              className="mb-gutter bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
            >
              {courses.map((course, index) => (
                <div
                  key={course.assignmentId}
                  className={`flex flex-wrap items-baseline gap-x-stack-md gap-y-unit px-stack-lg py-stack-md ${
                    index > 0 ? "border-t border-outline-variant/60" : ""
                  }`}
                >
                  <span className="font-data-mono text-data-mono font-semibold text-primary min-w-[7.5rem]">
                    {course.courseCode}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0">
                    {course.courseName}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    {course.allocatedHours} hrs allocated
                  </span>
                  {course.lecturerName && (
                    <span className="font-body-sm text-body-sm text-outline hidden sm:inline">
                      Lecturer: {course.lecturerName}
                    </span>
                  )}
                </div>
              ))}
            </section>

            {excuseSuccess && (
              <div
                role="status"
                className="mb-stack-md bg-primary-fixed rounded-lg px-stack-md py-stack-sm flex flex-wrap items-center gap-stack-md"
              >
                <p className="font-body-sm text-body-sm text-primary flex-1 min-w-[16rem]">
                  {excuseSuccess}
                </p>
                <Button type="button" onClick={() => navigate("/cover")}>
                  Set up cover
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-gutter items-start">
              {/* ── The session ledger: every upcoming session assigned to this tutor ── */}
              <section
                aria-label="Upcoming sessions"
                className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
              >
                <div className="flex items-baseline justify-between gap-stack-md px-stack-lg py-stack-md border-b border-outline-variant">
                  <h2 className="font-headline-md text-headline-md text-on-surface">
                    Upcoming sessions
                  </h2>
                  {upcomingCount > 0 && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {sessionsToLead} to lead · {upcomingCount} total
                    </p>
                  )}
                </div>

                {upcomingCount === 0 ? (
                  <div className="px-stack-lg py-stack-lg">
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      No sessions scheduled yet for {courseCodes.join(" or ")}.
                    </p>
                    <p className="font-body-sm text-body-sm text-outline mt-unit">
                      Your lecturer posts events for your courses — every event becomes a session here
                      as soon as it is on the timetable.
                    </p>
                  </div>
                ) : (
                  <div>
                    {upcomingGroups.map((group) => (
                      <div key={group.day}>
                        <div className="flex items-baseline justify-between gap-stack-md bg-surface-container-low px-stack-lg py-unit">
                          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                            {dayHeading(group.date)}
                          </h3>
                          <span className="font-body-sm text-body-sm text-outline">
                            {group.sessions.length} session{group.sessions.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <ul className="divide-y divide-outline-variant/50">
                          {group.sessions.map((session) => (
                            <SessionRow
                              key={session.id}
                              session={{
                                ...session,
                                draftReason:
                                  excusingSessionId === session.id ? excuseReason : undefined,
                              }}
                              isExcusing={excusingSessionId === session.id}
                              isSubmitting={isExcusing}
                              onExcuse={startExcuse}
                              onCancel={cancelExcuse}
                              onSubmit={handleExcuse}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Side rail: what matters next ── */}
              <aside className="space-y-gutter">
                <section
                  aria-label="Next session you lead"
                  className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg"
                >
                  <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
                    Next session you lead
                  </h2>
                  {nextSessionToLead ? (
                    <>
                      <p className="font-headline-lg text-headline-lg text-primary">
                        {dayHeading(nextSessionToLead.date)}
                      </p>
                      <p className="font-body-md text-body-md text-on-surface mt-unit">
                        <span className="font-data-mono font-semibold">
                          {nextSessionToLead.course?.courseCode}
                        </span>{" "}
                        — {nextSessionToLead.course?.courseName}
                      </p>
                      <p className="font-data-mono text-data-mono text-on-surface-variant mt-unit">
                        {formatSessionTimeRange(nextSessionToLead)}
                        {nextSessionMeta && ` · ${nextSessionMeta}`}
                      </p>
                    </>
                  ) : (
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      No sessions for you to lead right now. When your lecturer posts an event for one
                      of your courses, it shows up here.
                    </p>
                  )}
                </section>

                <section
                  aria-label="Hours this week"
                  className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg"
                >
                  <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
                    This week
                  </h2>
                  <p className="font-body-md text-body-md">
                    <span className="font-data-mono text-data-mono font-semibold text-primary">
                      {weekScheduledHours}h
                    </span>{" "}
                    <span className="text-on-surface-variant">
                      {hasWeeklyCap ? `of ${maxHoursPerWeek}h scheduled` : "scheduled this week"}
                    </span>
                  </p>
                  {hasWeeklyCap && (
                    <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-stack-sm mb-unit">
                      <div
                        className={`${isOverWeeklyCap ? "bg-urgent-orange" : "bg-primary"} h-1.5 rounded-full`}
                        style={{ width: `${weekBarPercent}%` }}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={maxHoursPerWeek}
                        aria-valuenow={weekScheduledHours}
                        aria-label="Scheduled hours this week"
                      />
                    </div>
                  )}
                  <p className="font-body-sm text-body-sm text-outline">
                    {hasWeeklyCap
                      ? "Across the sessions you lead, Monday to Sunday."
                      : "No weekly hour limit is on file for you yet."}
                  </p>
                </section>

                {coverNeededCount > 0 && (
                  <section
                    aria-label="Cover needed"
                    className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg"
                  >
                    <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-md">
                      Cover needed
                    </h2>
                    <p className="font-body-md text-body-md text-on-surface mb-stack-md">
                      You excused {coverNeededCount} session{coverNeededCount === 1 ? "" : "s"} that
                      still need{coverNeededCount === 1 ? "s" : ""} a volunteer.
                    </p>
                    <Link
                      to="/volunteer"
                      className="inline-block font-label-caps text-label-caps text-primary underline-offset-2 hover:underline"
                    >
                      View volunteer opportunities
                    </Link>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
