import { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import api from "../../utils/axiosInstance";
import { TUTORS, TIMESHEETS } from "../../data/mockData";

// GET /courses returns a plain array. The schema no longer carries
// budgetHours/hourlyRate, so the budget figures fall back to 0.
function mapApiCourse(c) {
  return {
    id: c.id,
    code: c.courseCode,
    name: c.courseName,
    req: c.tutorsRequired,
    budget: c.budgetHours ?? 0,
    rate: c.hourlyRate ?? 0,
    assignedCount: c.assignedTutors,
  };
}

/**
 * Sum approved hours per course code from a list of timesheets.
 * Only "approved" timesheets count — pending ones are excluded so
 * the organiser sees confirmed figures, not aspirational ones.
 */
function getApprovedHoursByCourse(timesheets) {
  return timesheets
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => {
      acc[t.courseCode] = (acc[t.courseCode] || 0) + t.hours;
      return acc;
    }, {});
}

/**
 * Sum approved hours per tutor from a list of timesheets.
 */
function getApprovedHoursByTutor(timesheets) {
  return timesheets
    .filter((t) => t.status === "approved")
    .reduce((acc, t) => {
      acc[t.tutorName] = (acc[t.tutorName] || 0) + t.hours;
      return acc;
    }, {});
}

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

export default function OrganiserAnalytics() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.get("/courses").then((res) => {
      if (!cancelled && res.status === 200 && Array.isArray(res.data)) {
        setCourses(res.data.map(mapApiCourse));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const courseHours = useMemo(() => getApprovedHoursByCourse(TIMESHEETS), []);
  const tutorHours = useMemo(() => getApprovedHoursByTutor(TIMESHEETS), []);

  const totalApprovedHours = Object.values(courseHours).reduce((a, b) => a + b, 0);
  const totalBudgetHours = courses.reduce((a, c) => a + c.budget, 0);
  const totalSpend = courses.reduce(
    (a, c) => a + (courseHours[c.code] || 0) * c.rate,
    0
  );
  const totalBudgetValue = courses.reduce((a, c) => a + c.budget * c.rate, 0);
  const activeTutorCount = Object.keys(tutorHours).length;

  return (
    <AppLayout role="tutor" title="Tutor Management System">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        {/* Header */}
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary mb-unit">Organiser Analytics</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Read-only overview of hours, budget utilisation, and tutor workload.
            All figures are derived from approved timesheets and allocation data.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-stack-lg mb-stack-lg">
          <StatCard
            icon="schedule"
            label="Approved Hours"
            value={`${totalApprovedHours}h`}
            subtext={`of ${totalBudgetHours}h budgeted`}
          />
          <StatCard
            icon="payments"
            label="Total Spend"
            value={`R${totalSpend.toLocaleString()}`}
            accent="text-secondary"
            subtext={`of R${totalBudgetValue.toLocaleString()} budgeted`}
          />
          <StatCard
            icon="school"
            label="Courses"
            value={courses.length}
            accent="text-primary"
            subtext={`${courses.filter((c) => (courseHours[c.code] || 0) > 0).length} with approved hours`}
          />
          <StatCard
            icon="group"
            label="Active Tutors"
            value={activeTutorCount}
            accent="text-secondary"
            subtext={`of ${TUTORS.length} total`}
          />
        </div>

        {/* Hours per course */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
          <div className="p-stack-lg border-b border-outline-variant">
            <h3 className="font-headline-md text-headline-md text-on-surface">Hours per Course</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
              Summed from approved timesheets only.
            </p>
          </div>
          <div className="p-stack-lg space-y-stack-lg">
            {courses.map((c) => {
              const hours = courseHours[c.code] || 0;
              const pct = c.budget ? Math.round((hours / c.budget) * 100) : 0;
              const isOver = pct > 90;
              return (
                <div key={c.code}>
                  <div className="flex justify-between items-end mb-stack-sm">
                    <div>
                      <span className="font-body-md text-body-md font-bold text-on-surface">{c.code}</span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant ml-2">{c.name}</span>
                    </div>
                    <div className="flex items-baseline gap-unit">
                      <span className={`font-data-mono text-data-mono font-bold ${isOver ? "text-urgent-orange" : "text-primary"}`}>
                        {hours}h
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">/ {c.budget}h</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${isOver ? "bg-urgent-orange" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">
                    {pct}% of budget used
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spend vs budget */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento mb-stack-lg">
          <div className="p-stack-lg border-b border-outline-variant">
            <h3 className="font-headline-md text-headline-md text-on-surface">Spend vs Budget</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
              Cost per course at the standard hourly rate. Figures are derived from approved timesheets.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface border-b border-outline-variant">
                <tr>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Course</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Hours Used</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Budget Hours</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Rate/hr</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Spend</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Budget</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const hours = courseHours[c.code] || 0;
                  const spend = hours * c.rate;
                  const budgetValue = c.budget * c.rate;
                  const remaining = budgetValue - spend;
                  const isLow = remaining < budgetValue * 0.2;
                  return (
                    <tr key={c.code} className="border-b border-outline-variant/50">
                      <td className="p-stack-sm font-body-md text-on-surface font-bold">{c.code}</td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface">{hours}h</td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">{c.budget}h</td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">R{c.rate}</td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface font-bold">
                        R{spend.toLocaleString()}
                      </td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">
                        R{budgetValue.toLocaleString()}
                      </td>
                      <td className="p-stack-sm">
                        <span
                          className={`font-data-mono text-data-mono font-bold ${
                            isLow ? "text-urgent-orange" : "text-trust-blue"
                          }`}
                        >
                          R{remaining.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="bg-surface-container-low font-bold">
                  <td className="p-stack-sm font-body-md text-on-surface">Total</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface">{totalApprovedHours}h</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">{totalBudgetHours}h</td>
                  <td className="p-stack-sm" />
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface">
                    R{totalSpend.toLocaleString()}
                  </td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">
                    R{totalBudgetValue.toLocaleString()}
                  </td>
                  <td className="p-stack-sm">
                    <span
                      className={`font-data-mono text-data-mono font-bold ${
                        totalBudgetValue - totalSpend < totalBudgetValue * 0.2
                          ? "text-urgent-orange"
                          : "text-trust-blue"
                      }`}
                    >
                      R{(totalBudgetValue - totalSpend).toLocaleString()}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Workload spread */}
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-bento">
          <div className="p-stack-lg border-b border-outline-variant">
            <h3 className="font-headline-md text-headline-md text-on-surface">Workload Spread</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
              Approved hours per tutor across the term.
            </p>
          </div>
          <div className="p-stack-lg space-y-stack-md">
            {TUTORS.map((t) => {
              const hours = tutorHours[t.name] || 0;
              const maxHours = Math.max(...Object.values(tutorHours), 1);
              const widthPct = Math.round((hours / maxHours) * 100);
              return (
                <div key={t.id} className="flex items-center gap-stack-md">
                  <div className="w-32 shrink-0">
                    <span className="font-body-md text-body-md text-on-surface truncate block">{t.name}</span>
                  </div>
                  <div className="flex-1 bg-surface-container-high rounded-full h-6 relative overflow-hidden">
                    <div
                      className="h-6 rounded-full bg-secondary transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                    {hours > 0 && (
                      <span className="absolute inset-0 flex items-center pl-2 font-data-mono text-data-mono text-on-surface text-xs">
                        {hours}h
                      </span>
                    )}
                  </div>
                  <span className="font-data-mono text-data-mono text-on-surface-variant w-12 text-right shrink-0">
                    {hours > 0 ? `${hours}h` : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Detail table */}
          <div className="border-t border-outline-variant overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface border-b border-outline-variant">
                <tr>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Tutor</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Approved Hours</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Rating</th>
                  <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Status</th>
                </tr>
              </thead>
              <tbody>
                {TUTORS.map((t) => {
                  const hours = tutorHours[t.name] || 0;
                  return (
                    <tr key={t.id} className="border-b border-outline-variant/50">
                      <td className="p-stack-sm font-body-md text-on-surface">{t.name}</td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-primary font-bold">
                        {hours > 0 ? `${hours}h` : "—"}
                      </td>
                      <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">
                        {t.rating}
                      </td>
                      <td className="p-stack-sm">
                        <span
                          className={`font-label-caps text-label-caps px-2 py-0.5 rounded ${
                            t.verified
                              ? "text-trust-blue bg-trust-blue/10"
                              : "text-urgent-orange bg-urgent-orange/10"
                          }`}
                        >
                          {t.verified ? "VERIFIED" : "UNVERIFIED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
