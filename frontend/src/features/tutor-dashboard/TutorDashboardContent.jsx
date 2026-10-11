import { useMemo } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import { formatSessionTimeRange } from "../../utils/formatSession.js";

/**
 * TutorDashboardContent
 * The presentational body of the tutor dashboard (course list, session ledger,
 * next-session / hours / cover-needed rail). It owns no data fetching: the
 * authenticated TutorDashboard feeds it live data inside AppLayout, while the
 * landing page's DashboardPreview feeds it sample data with `readOnly` set so
 * nothing in the preview can navigate or open forms.
 */

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
// Only excused and volunteered sessions get a chip.
const stateChipFor = (session) => {
  if (session.status === "UNASSIGNED") {
    return { className: "bg-urgent-orange/10 text-urgent-orange", label: "Excused — awaiting volunteer" };
  }
  if (session.status === "PENDING") {
    return { className: "bg-trust-blue/10 text-trust-blue", label: "Volunteer pending" };
  }
  return null;
};

function SessionRow({ session, isExcusing, onExcuse, onCancel, onSubmit, isSubmitting, formatTime, readOnly }) {
  const chip = stateChipFor(session);
  const slotMeta = sessionSlotMeta(session);

  return (
    <li className="border-l-[3px] border-primary bg-surface-container-lowest">
      <div className="flex flex-wrap items-start gap-x-stack-md gap-y-unit px-stack-md py-stack-md">
        <div className="w-28 shrink-0">
          <p className="font-data-mono text-data-mono text-on-surface">{formatTime(session)}</p>
          {slotMeta && <p className="font-body-sm text-body-sm text-outline mt-unit">{slotMeta}</p>}
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
            tabIndex={readOnly ? -1 : undefined}
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

const noop = () => {};

export default function TutorDashboardContent({
  firstName,
  courses = [],
  sessions = [],
  maxHoursPerWeek = null,
  weekScheduledHours = 0,
  isLoading = false,
  error = "",
  excusingSessionId = null,
  excuseReason = "",
  isExcusing = false,
  onExcuse = noop,
  onCancelExcuse = noop,
  onSubmitExcuse = noop,
  // Lets the landing preview supply pre-formatted times instead of raw slot data.
  formatTime = formatSessionTimeRange,
  // Preview mode: no navigation, no focusable actions, heading demoted to h2.
  readOnly = false,
}) {
  const Heading = readOnly ? "h2" : "h1";
  const todayStart = startOfDay(new Date()).getTime();

  // Sessions arrive already scoped to the tutor and sorted by date; everything
  // below is presentation.
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

  const upcomingSessions = upcomingGroups.flatMap((group) => group.sessions);
  const upcomingCount = upcomingSessions.length;
  const sessionsToLead = upcomingSessions.filter((s) => s.status === "SCHEDULED").length;
  const nextSessionToLead = upcomingSessions.find((session) => session.status === "SCHEDULED");
  const nextSessionMeta = nextSessionToLead ? sessionSlotMeta(nextSessionToLead) : null;
  const coverNeededCount = upcomingSessions.filter((session) => session.status === "UNASSIGNED").length;

  // weekScheduledHours only counts sessions the tutor still leads, so excusing
  // one lowers the card immediately. The bar turns orange past the weekly cap —
  // the approved application's, or the organiser's Max Claimable Hours setting
  // when no approved application carries hours. With neither on file the card
  // shows the hours alone — no "of —h", no bar.
  const hasWeeklyCap = maxHoursPerWeek > 0;
  const weekBarPercent =
    hasWeeklyCap ? Math.min(100, Math.round((weekScheduledHours / maxHoursPerWeek) * 100)) : 0;
  const isOverWeeklyCap = hasWeeklyCap && weekScheduledHours > maxHoursPerWeek;

  const courseCodes = courses.map((course) => course.courseCode);

  return (
    <div className="p-margin-page max-w-container-max mx-auto w-full">
      {/* ── Course context — what this tutor is approved to teach ── */}
      <header className="mb-stack-lg">
        <p className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-unit">
          Tutor Dashboard
        </p>
        <Heading className="font-display text-display text-on-surface">
          {firstName ? `${firstName}'s tutoring schedule` : "Your tutoring schedule"}
        </Heading>
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
      ) : courses.length === 0 ? (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-unit">
            No course assignments yet
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            You are not currently assigned to tutor any courses. Once the organiser assigns you to a
            course you applied for, its details and every session derived from its events will appear
            here.
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

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-gutter items-start">
            {/* ── The session ledger: every upcoming session assigned to this tutor ── */}
            <section
              aria-label="Upcoming sessions"
              className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
            >
              <div className="flex items-baseline justify-between gap-stack-md px-stack-lg py-stack-md border-b border-outline-variant">
                <h2 className="font-headline-md text-headline-md text-on-surface">Upcoming sessions</h2>
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
                    Your lecturer posts events for your courses — every event becomes a session here as
                    soon as it is on the timetable.
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
                              draftReason: excusingSessionId === session.id ? excuseReason : undefined,
                            }}
                            isExcusing={excusingSessionId === session.id}
                            isSubmitting={isExcusing}
                            onExcuse={onExcuse}
                            onCancel={onCancelExcuse}
                            onSubmit={onSubmitExcuse}
                            formatTime={formatTime}
                            readOnly={readOnly}
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
                      {formatTime(nextSessionToLead)}
                      {nextSessionMeta && ` · ${nextSessionMeta}`}
                    </p>
                  </>
                ) : (
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    No sessions for you to lead right now. When your lecturer posts an event for one of
                    your courses, it shows up here.
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
                    You excused {coverNeededCount} session{coverNeededCount === 1 ? "" : "s"} that still
                    need{coverNeededCount === 1 ? "s" : ""} a volunteer.
                  </p>
                  {readOnly ? (
                    <span className="inline-block font-label-caps text-label-caps text-primary">
                      View volunteer opportunities
                    </span>
                  ) : (
                    <Link
                      to="/volunteer"
                      className="inline-block font-label-caps text-label-caps text-primary underline-offset-2 hover:underline"
                    >
                      View volunteer opportunities
                    </Link>
                  )}
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}