import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";

// Hours are stored as whole numbers but the API may return a float after
// aggregation, so keep the display compact (12 -> "12", 12.5 -> "12.5").
const formatHours = (value) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 });

// Money display with the rand sign (1800 -> "R1 800", 1800.5 -> "R1 800.5")
const formatRand = (value) =>
  `R${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Compact money for chart labels (1500 -> "R1.5k", 150000 -> "R150k", 750 -> "R750")
const formatRandCompact = (value) => {
  const amount = Number(value ?? 0);
  if (amount >= 1000) {
    return `R${(amount / 1000).toLocaleString(undefined, {
      maximumFractionDigits: amount >= 10000 ? 0 : 1,
    })}k`;
  }
  return `R${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

// "2026-01" -> "Jan", with the year appended on January (and on the window's
// first point when it crosses a year boundary) so the axis stays unambiguous
const monthLabel = (key, showYear) => {
  const [year, month] = key.split('-').map(Number);
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
  });
  return showYear ? `${label} '${String(year).slice(2)}` : label;
};

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
  const { currentUser, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Re-fetch whenever the Refresh button or a failed load bumps reloadKey so
  // the figures always come from the database rather than a cached snapshot.
  useEffect(() => {
    // Wait for Firebase to restore the session before the first fetch — the
    // axios interceptor reads auth.currentUser at request time and would
    // otherwise send the request without a token (401 on hard refresh).
    // (uid, not the user object — profile enrichment rebuilds its identity.)
    if (authLoading || !currentUser?.uid) return;

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
          setError(
            response?.data?.message ||
              response?.data?.error ||
              "Could not load the analytics. Please try again."
          );
        }
      } catch {
        if (!cancelled) {
          setError("Could not load the analytics. Please try again.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchAnalytics();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, authLoading, currentUser?.uid]);

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
  const spending = data?.spending ?? { monthlyBudget: null, months: [] };
  const spendingMonths = spending.months ?? [];
  // Line-chart scale: the budget joins the tallest month in setting the top of
  // the y-axis so the reference line is always in view, with headroom so the
  // highest dot never clips against the top of the card.
  const chartMax =
    Math.max(...spendingMonths.map((month) => month.amount), spending.monthlyBudget ?? 0, 1) * 1.08;
  const budgetYPct =
    spending.monthlyBudget != null && spending.monthlyBudget > 0
      ? (spending.monthlyBudget / chartMax) * 100
      : null;
  // Point positions in the 100x100 viewBox space (y grows downwards). One point
  // per month at the centre of its column keeps the dots aligned with the
  // month labels rendered below the chart.
  const spendPoints = spendingMonths.map((month, index) => ({
    x: ((index + 0.5) / spendingMonths.length) * 100,
    y: 100 - (month.amount / chartMax) * 100,
  }));
  const currentMonth = spendingMonths[spendingMonths.length - 1] ?? null;
  const totalSpend = spendingMonths.reduce((total, month) => total + (month.amount ?? 0), 0);
  const hasSpend = spendingMonths.some((month) => month.amount > 0);
  const maxWorkloadHours = Math.max(...workload.map((row) => row.approvedHours), 1);
  const sessionsNeedingCover = sessions.unassigned + sessions.pendingCover;

  return (
    <AppLayout title="Tutor Management System">
      <div className="p-gutter md:p-margin-page max-w-container-max mx-auto w-full">
        {/* Header */}
        <div className="mb-stack-lg flex flex-wrap items-start justify-between gap-gutter">
          <div className="flex-1 min-w-[14rem]">
            <h2 className="font-display text-display text-primary mb-unit">Organiser Analytics</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              Live overview of staffing coverage, timesheet sign-off, monthly spending,
              applications and tutor workload. Every figure is computed from the current
              data — refresh to pull the latest numbers.
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
          <div className="mb-stack-lg flex flex-wrap items-center gap-stack-md">
            <div className="flex-1 min-w-64">
              <ErrorMessage>{error}</ErrorMessage>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={isLoading}
              className="shrink-0 inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-stack-md py-stack-sm font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Try again
            </button>
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

            {/* Monthly spending — months vs amount spent */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
              <div className="p-stack-lg border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md text-on-surface">Monthly Spending</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
                  Amount spent per month on all tutors, derived from approved timesheets (claimed
                  hours × the tutor's year-of-study hourly rate)
                  {spending.monthlyBudget != null
                    ? '. The dashed line marks the monthly budget.'
                    : '. Set a monthly budget in Settings to compare spending against it.'}
                </p>
              </div>
              <div className="p-stack-lg">
                {hasSpend ? (
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      <div className="relative h-56 border-b border-outline-variant">
                        {/* Lines live in a stretched 100x100 viewBox; the dots are
                            HTML overlays so they stay perfectly round. Points sit
                            at each month's column centre to line up with the
                            labels underneath. */}
                        <svg
                          className="absolute inset-0 h-full w-full text-primary"
                          viewBox="0 0 100 100"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          {/* Faint horizontal guides at quarter steps of the scale */}
                          {[25, 50, 75].map((pct) => (
                            <line
                              key={pct}
                              x1="0"
                              x2="100"
                              y1={100 - pct}
                              y2={100 - pct}
                              className="text-outline-variant"
                              stroke="currentColor"
                              strokeWidth="1"
                              vectorEffect="non-scaling-stroke"
                              opacity="0.5"
                            />
                          ))}
                          {spendPoints.length > 1 && (
                            <>
                              <polygon
                                points={[
                                  `${spendPoints[0].x},100`,
                                  ...spendPoints.map((p) => `${p.x},${p.y}`),
                                  `${spendPoints[spendPoints.length - 1].x},100`,
                                ].join(' ')}
                                fill="currentColor"
                                fillOpacity="0.1"
                              />
                              <polyline
                                points={spendPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                vectorEffect="non-scaling-stroke"
                              />
                            </>
                          )}
                          {budgetYPct != null && (
                            <line
                              x1="0"
                              x2="100"
                              y1={100 - budgetYPct}
                              y2={100 - budgetYPct}
                              className="text-secondary"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeDasharray="6 4"
                              vectorEffect="non-scaling-stroke"
                            />
                          )}
                        </svg>
                        {budgetYPct != null && (
                          <span
                            className="absolute right-0 font-label-caps text-label-caps text-secondary whitespace-nowrap"
                            style={{ bottom: `calc(${budgetYPct}% + 4px)` }}
                          >
                            Budget {formatRandCompact(spending.monthlyBudget)}
                          </span>
                        )}
                        {spendingMonths.map((month, index) => {
                          const overBudget =
                            spending.monthlyBudget != null && month.amount > spending.monthlyBudget;
                          return (
                            <div
                              key={month.month}
                              className="absolute -translate-x-1/2 translate-y-1/2 p-1.5"
                              style={{
                                left: `${spendPoints[index].x}%`,
                                bottom: `${(month.amount / chartMax) * 100}%`,
                              }}
                              title={`${month.month}: ${formatRand(month.amount)}`}
                            >
                              <span
                                className={`block w-2.5 h-2.5 rounded-full transition-colors ${
                                  month.amount === 0
                                    ? 'bg-surface-container-high'
                                    : overBudget
                                      ? 'bg-urgent-orange'
                                      : 'bg-primary'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex gap-stack-sm mt-stack-sm">
                        {spendingMonths.map((month, index) => (
                          <span
                            key={month.month}
                            className="flex-1 text-center font-label-caps text-label-caps text-on-surface-variant truncate"
                          >
                            {monthLabel(month.month, index === 0 || month.month.endsWith('-01'))}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-stack-sm">
                        {spendingMonths.map((month) => (
                          <span
                            key={month.month}
                            className="flex-1 text-center font-data-mono text-data-mono text-on-surface-variant truncate"
                          >
                            {month.amount > 0 ? formatRandCompact(month.amount) : '—'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="font-body-md text-body-md text-on-surface-variant py-stack-lg text-center">
                    No approved timesheets yet — spending appears here once timesheets are
                    approved.
                  </p>
                )}
                <p className="font-label-caps text-label-caps text-on-surface-variant mt-stack-md">
                  {currentMonth && currentMonth.amount > 0
                    ? `${monthLabel(currentMonth.month, false)}: ${formatRand(currentMonth.amount)}`
                    : 'This month'}
                  {spending.monthlyBudget != null ? ` of ${formatRand(spending.monthlyBudget)} budgeted` : ''}
                  {` · ${formatRand(totalSpend)} over the last 12 months`}
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
