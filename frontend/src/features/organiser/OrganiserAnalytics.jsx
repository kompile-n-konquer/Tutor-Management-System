import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import api from "../../utils/axiosInstance";

// Hours are stored as whole numbers but the API may return a float after
// aggregation, so keep the display compact (12 -> "12", 12.5 -> "12.5").
const formatHours = (value) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

function StatCard({ icon, label, value, accent = "text-primary", subtext }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-bento">
      <div className="flex items-center gap-stack-sm mb-stack-sm">
        <span className="material-symbols-outlined text-secondary">{icon}</span>
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">{label}</span>
      </div>
      <p className={`font-display text-display ${accent}`}>{value}</p>
      {subtext && (
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">{subtext}</p>
      )}
    </div>
  );
}

// Compact tile used for status breakdowns inside the detail cards.
function MetricTile({ label, value, accent = "text-on-surface" }) {
  return (
    <div className="bg-surface-container-low rounded-lg p-stack-md border border-outline-variant/50">
      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">{label}</p>
      <p className={`font-display text-headline-md mt-unit ${accent}`}>{value}</p>
    </div>
  );
}

// Placeholders mirroring the KPI grid and section cards so the layout does
// not jump when the real numbers arrive.
function AnalyticsSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-stack-lg mb-stack-lg">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="animate-pulse bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-bento"
          >
            <div className="h-4 w-24 rounded bg-surface-container-high mb-stack-md" />
            <div className="h-10 w-24 rounded bg-surface-container-high mb-stack-sm" />
            <div className="h-3 w-32 rounded bg-surface-container-high/60" />
          </div>
        ))}
      </div>

      <div className="animate-pulse bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg p-stack-lg">
        <div className="h-5 w-48 rounded bg-surface-container-high mb-stack-lg" />
        <div className="space-y-stack-md">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="h-4 rounded bg-surface-container-high/60" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
        {[0, 1].map((card) => (
          <div
            key={card}
            className="animate-pulse bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento p-stack-lg"
          >
            <div className="h-5 w-40 rounded bg-surface-container-high mb-stack-lg" />
            <div className="grid grid-cols-3 gap-stack-md">
              {[0, 1, 2].map((tile) => (
                <div key={tile} className="h-16 rounded-lg bg-surface-container-high/60" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrganiserAnalytics() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Re-fetch on mount and whenever the Refresh button bumps reloadKey so the
  // figures always come from the database rather than a cached snapshot.
  useEffect(() => {
    let cancelled = false;

    const fetchAnalytics = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await api.get("/analytics/organiser");
        if (cancelled) return;
        if (response.status === 200) {
          setData(response.data);
        } else {
          setError(response?.data?.message || "Could not load the analytics. Please refresh the page.");
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the analytics. Please refresh the page.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const totals = data?.totals ?? {};
  const staffing = data?.staffing ?? { required: 0, assigned: 0, understaffedCourses: 0, courses: [] };
  const sessions = data?.sessions ?? { scheduled: 0, unassigned: 0, pendingCover: 0 };
  const timesheets = data?.timesheets ?? {
    draft: 0, submitted: 0, approved: 0, rejected: 0,
    approvedHours: 0, submittedHours: 0, signOffRate: 0,
  };
  const applications = data?.applications ?? {
    role: { pending: 0, approved: 0, rejected: 0 },
    course: { pending: 0, assigned: 0, rejected: 0 },
  };
  const workload = data?.workload ?? [];
  const maxWorkloadHours = Math.max(...workload.map((row) => row.approvedHours), 1);
  const sessionsNeedingCover = sessions.unassigned + sessions.pendingCover;

  return (
    <AppLayout title="Tutor Management System">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        {/* Header */}
        <div className="mb-stack-lg flex flex-wrap items-start justify-between gap-gutter">
          <div className="flex-1 min-w-[14rem]">
            <h2 className="font-display text-display text-primary mb-unit">Organiser Analytics</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Live overview of staffing coverage, timesheet sign-off, applications and tutor
              workload. Every figure is computed from the current data — refresh to pull the
              latest numbers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={isLoading}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-stack-md py-stack-sm font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-stack-lg">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {isLoading && !data ? (
          <AnalyticsSkeleton />
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-stack-lg mb-stack-lg">
              <StatCard
                icon="schedule"
                label="Approved Hours"
                value={`${formatHours(timesheets.approvedHours)}h`}
                subtext={`${formatHours(timesheets.submittedHours)}h awaiting sign-off`}
              />
              <StatCard
                icon="group"
                label="Tutors"
                value={totals.tutors}
                accent="text-secondary"
                subtext={`${totals.lecturers} lecturers · ${totals.students} students`}
              />
              <StatCard
                icon="school"
                label="Courses"
                value={totals.courses}
                subtext={`${staffing.understaffedCourses} understaffed`}
              />
              <StatCard
                icon="event_upcoming"
                label="Upcoming Events"
                value={totals.upcomingEvents}
                accent="text-secondary"
                subtext={`${totals.events} created in total`}
              />
            </div>

            {/* Timesheet sign-off */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
              <div className="p-stack-lg border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md text-on-surface">Timesheet Sign-off</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                  Review progress of submitted timesheets. Drafts are excluded from the sign-off rate.
                </p>
              </div>
              <div className="p-stack-lg">
                <div className="flex flex-wrap items-baseline gap-x-stack-sm gap-y-unit mb-stack-sm">
                  <span className="font-display text-display text-primary">{timesheets.signOffRate}%</span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    of reviewed timesheets approved
                  </span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2 mb-stack-lg">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{ width: `${timesheets.signOffRate}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-stack-md">
                  <MetricTile label="Draft" value={timesheets.draft} accent="text-on-surface-variant" />
                  <MetricTile label="Awaiting Review" value={timesheets.submitted} accent="text-secondary" />
                  <MetricTile label="Approved" value={timesheets.approved} accent="text-primary" />
                  <MetricTile label="Rejected" value={timesheets.rejected} accent="text-urgent-orange" />
                </div>
                <p className="font-label-caps text-label-caps text-on-surface-variant mt-stack-md">
                  {formatHours(timesheets.approvedHours)}h approved · {formatHours(timesheets.submittedHours)}h awaiting review
                </p>
              </div>
            </div>

            {/* Allocation coverage */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
              <div className="p-stack-lg border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md text-on-surface">Allocation Coverage</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                  Tutors assigned against the number each course requires ({staffing.assigned} of{" "}
                  {staffing.required} positions filled).
                </p>
              </div>
              <div className="p-stack-lg space-y-stack-lg">
                {staffing.courses.length === 0 ? (
                  <p className="font-body-md text-body-md text-on-surface-variant py-stack-lg text-center">
                    No courses have been created yet.
                  </p>
                ) : (
                  staffing.courses.map((course) => {
                    const pct =
                      course.tutorsRequired > 0
                        ? Math.round((course.assigned / course.tutorsRequired) * 100)
                        : 100;
                    const understaffed = course.assigned < course.tutorsRequired;
                    return (
                      <div key={course.id}>
                        <div className="flex flex-wrap items-center justify-between gap-x-stack-md gap-y-unit mb-stack-sm">
                          <div className="flex items-center gap-x-stack-sm min-w-0">
                            <span className="font-data-mono text-data-mono font-bold text-on-surface">
                              {course.courseCode}
                            </span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant break-words">
                              {course.courseName}
                            </span>
                          </div>
                          <div className="flex items-center gap-stack-sm shrink-0">
                            {understaffed && (
                              <span className="font-label-caps text-label-caps text-urgent-orange bg-urgent-orange/10 px-2 py-0.5 rounded-full">
                                Understaffed
                              </span>
                            )}
                            <span className="font-data-mono text-data-mono text-on-surface">
                              {course.assigned} / {course.tutorsRequired}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-high rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              understaffed ? "bg-urgent-orange" : "bg-primary"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Tutor workload */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
              <div className="p-stack-lg border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md text-on-surface">Tutor Workload</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                  Approved hours per tutor; hours still awaiting review are shown beside each figure.
                </p>
              </div>
              <div className="p-stack-lg space-y-stack-md">
                {workload.length === 0 ? (
                  <p className="font-body-md text-body-md text-on-surface-variant py-stack-lg text-center">
                    No approved or submitted timesheets yet.
                  </p>
                ) : (
                  workload.map((tutor) => (
                    <div key={tutor.userId} className="flex items-center gap-stack-md">
                      <div className="w-32 shrink-0">
                        <span className="font-body-md text-body-md text-on-surface truncate block">
                          {tutor.name}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 bg-surface-container-high rounded-full h-6 overflow-hidden">
                        <div
                          className="h-6 rounded-full bg-secondary transition-all"
                          style={{
                            width: `${Math.round((tutor.approvedHours / maxWorkloadHours) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="w-28 shrink-0 text-right">
                        <span className="font-data-mono text-data-mono text-on-surface block">
                          {formatHours(tutor.approvedHours)}h
                        </span>
                        {tutor.submittedHours > 0 && (
                          <span className="font-body-sm text-body-sm text-on-surface-variant block">
                            +{formatHours(tutor.submittedHours)}h pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Applications pipeline + session cover */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-stack-lg">
              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento">
                <div className="p-stack-lg border-b border-outline-variant">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Applications Pipeline</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                    Role applications and course applications by current status.
                  </p>
                </div>
                <div className="p-stack-lg">
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-stack-sm">
                    Tutor &amp; lecturer roles
                  </p>
                  <div className="grid grid-cols-3 gap-stack-md mb-stack-lg">
                    <MetricTile label="Pending" value={applications.role.pending} accent="text-secondary" />
                    <MetricTile label="Approved" value={applications.role.approved} accent="text-primary" />
                    <MetricTile label="Rejected" value={applications.role.rejected} accent="text-urgent-orange" />
                  </div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-stack-sm">
                    Course allocations
                  </p>
                  <div className="grid grid-cols-3 gap-stack-md">
                    <MetricTile label="Pending" value={applications.course.pending} accent="text-secondary" />
                    <MetricTile label="Assigned" value={applications.course.assigned} accent="text-primary" />
                    <MetricTile label="Rejected" value={applications.course.rejected} accent="text-urgent-orange" />
                  </div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento">
                <div className="p-stack-lg border-b border-outline-variant">
                  <h3 className="font-headline-md text-headline-md text-on-surface">Session Cover</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                    Tutoring sessions by cover status.
                  </p>
                </div>
                <div className="p-stack-lg">
                  <div className="grid grid-cols-3 gap-stack-md">
                    <MetricTile label="Covered" value={sessions.scheduled} accent="text-primary" />
                    <MetricTile label="Unassigned" value={sessions.unassigned} accent="text-urgent-orange" />
                    <MetricTile label="Pending Cover" value={sessions.pendingCover} accent="text-secondary" />
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-stack-md">
                    {sessionsNeedingCover > 0
                      ? `${sessionsNeedingCover} session${sessionsNeedingCover === 1 ? '' : 's'} still need a tutor.`
                      : "Every session currently has a tutor."}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  );
}
