import React, { useCallback, useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout.jsx";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import OnboardingWalkthrough from "../../components/onboarding/OnboardingWalkthrough.jsx";
import { useFirstVisit } from "../../hooks/useFirstVisit.js";
import api from "../../utils/axiosInstance.js";
import { formatSessionDate, formatSessionTimeRange } from "../../utils/formatSession.js";

const TUTOR_ONBOARDING_STEPS = [
  { title: "Welcome to your Tutor Dashboard", body: "This is where you'll see upcoming sessions, hours logged, and quick actions every time you log in." },
  { title: "Your Weekly Schedule", body: "The sessions table shows every session you're assigned to this week, with its time and current status." },
  { title: "Quick Actions", body: "Need to skip a session or pick up more hours? Excuse yourself from a session here, or use Quick Actions instead of emailing your organiser directly." },
  { title: "Submitting Timesheets", body: "At the end of each pay period, review your logged hours here and submit with one click." },
];

const sessionStatusBadge = (status) => {
  switch (status) {
    case "UNASSIGNED":
      return { className: "bg-urgent-orange/10 text-urgent-orange", label: "Excused — awaiting volunteer" };
    case "PENDING":
      return { className: "bg-primary/10 text-primary", label: "Volunteer pending" };
    default:
      return { className: "bg-trust-blue/10 text-trust-blue", label: "Active" };
  }
};

export default function TutorDashboard() {
  const { isFirstVisit, markSeen } = useFirstVisit("tutor-dashboard");

  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [excusingSessionId, setExcusingSessionId] = useState(null);
  const [excuseReason, setExcuseReason] = useState("");
  const [isExcusing, setIsExcusing] = useState(false);

  const fetchMySessions = useCallback(async () => {
    try {
      const response = await api.get("/sessions/mine");
      if (response.status !== 200) {
        setError(response.data?.message || "Could not load your sessions. Please try again later.");
        return;
      }
      setSessions(response.data);
    } catch {
      setError("Could not load your sessions. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMySessions();
  }, [fetchMySessions]);

  const startExcuse = (sessionId) => {
    setExcusingSessionId(sessionId);
    setExcuseReason("");
    setError("");
  };

  const cancelExcuse = () => {
    setExcusingSessionId(null);
    setExcuseReason("");
    setError("");
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
      // The session is back to UNASSIGNED — reload the list to show its new status.
      cancelExcuse();
      await fetchMySessions();
    } catch {
      setError("Could not submit your excuse. Please try again later.");
    } finally {
      setIsExcusing(false);
    }
  };

  return (
    <AppLayout role="tutor" title="Tutor Management System">
      {isFirstVisit && <OnboardingWalkthrough steps={TUTOR_ONBOARDING_STEPS} onDismiss={markSeen} />}

      <div className="p-margin-page max-w-container-max mx-auto w-full">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary mb-unit">Welcome back, Alex!</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Here's a quick overview of your tutoring schedule and progress this week.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg mb-stack-lg">
          <div className="bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed to-transparent opacity-30 z-0" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-stack-md">
                <span className="font-label-caps text-label-caps text-primary tracking-widest uppercase">Next Session</span>
                <span className="bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 rounded-full font-label-caps text-label-caps">In 2 Hours</span>
              </div>
              <h3 className="font-headline-lg text-headline-lg text-on-surface mb-unit">Intro to Data Structures</h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-stack-md">COMP 201 - Room 402</p>
              <div className="flex items-center gap-stack-sm">
                <span className="material-symbols-outlined text-primary">schedule</span>
                <span className="font-data-mono text-data-mono">14:00 - 15:30</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col justify-between">
            <div className="flex justify-between items-start mb-stack-md">
              <span className="font-label-caps text-label-caps text-secondary tracking-widest uppercase">Hours Logged this Week</span>
              <span className="material-symbols-outlined text-secondary">trending_up</span>
            </div>
            <div>
              <div className="flex items-baseline gap-unit mb-unit">
                <span className="font-display text-display text-on-surface">12.5</span>
                <span className="font-body-lg text-body-lg text-on-surface-variant">/ 15 hrs</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-2 mb-stack-sm">
                <div className="bg-secondary h-2 rounded-full" style={{ width: "83%" }} />
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">You're on track to meet your weekly requirement!</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-lg">
          {/* Live sessions — loaded from /sessions/mine, with the excuse flow. */}
          <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col h-full">
            <div className="p-stack-lg border-b border-outline-variant flex justify-between items-center">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">Assigned Tutoring Sessions</h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Your schedule for the coming week</p>
              </div>
            </div>
            <div className="p-stack-sm flex-1 overflow-x-auto">
              {error && <ErrorMessage>{error}</ErrorMessage>}
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Course</th>
                    <th className="py-stack-sm px-stack-md">Date / Time</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                    <th className="py-stack-sm px-stack-md">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-md">
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="py-stack-sm px-stack-md text-on-surface-variant">Loading your sessions…</td>
                    </tr>
                  ) : sessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-stack-sm px-stack-md text-on-surface-variant">You have no assigned sessions yet.</td>
                    </tr>
                  ) : (
                    sessions.map((session) => {
                      const course = session.assignment?.course;
                      const badge = sessionStatusBadge(session.status);

                      return (
                        <React.Fragment key={session.id}>
                          <tr>
                            <td className="py-stack-sm px-stack-md font-bold text-primary">
                              {course ? `${course.courseCode} — ${course.courseName}` : "Tutoring Session"}
                            </td>
                            <td className="py-stack-sm px-stack-md font-data-mono">
                              {formatSessionDate(session.date)} / {formatSessionTimeRange(session)}
                            </td>
                            <td className="py-stack-sm px-stack-md">
                              <span className={`${badge.className} px-2 py-1 rounded text-xs font-semibold`}>{badge.label}</span>
                            </td>
                            <td className="py-stack-sm px-stack-md">
                              {session.status === "SCHEDULED" && (
                                <button
                                  type="button"
                                  onClick={() => startExcuse(session.id)}
                                  className="text-urgent-orange hover:opacity-80 font-label-caps text-label-caps underline-offset-2 hover:underline"
                                >
                                  Excuse Myself
                                </button>
                              )}
                            </td>
                          </tr>
                          {excusingSessionId === session.id && (
                            <tr>
                              <td colSpan={4} className="py-stack-md px-stack-md bg-surface-container-low">
                                <form onSubmit={(event) => handleExcuse(event, session.id)} className="space-y-stack-sm max-w-xl">
                                  <label htmlFor={`excuse-reason-${session.id}`} className="font-label-caps text-label-caps text-on-surface-variant block">
                                    Reason for excusing yourself
                                  </label>
                                  <textarea
                                    id={`excuse-reason-${session.id}`}
                                    value={excuseReason}
                                    onChange={(event) => {
                                      setExcuseReason(event.target.value);
                                      setError("");
                                    }}
                                    rows={2}
                                    required
                                    placeholder="e.g. Medical appointment I could not move"
                                    className="w-full border border-surface-variant rounded-DEFAULT p-stack-sm font-body-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex gap-stack-sm">
                                    <Button type="submit" loading={isExcusing}>
                                      Confirm Excuse
                                    </Button>
                                    <button
                                      type="button"
                                      onClick={cancelExcuse}
                                      className="px-4 py-3 rounded-DEFAULT font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-variant transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </form>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-stack-lg">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-stack-lg shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-md">Quick Actions</h3>
              <div className="space-y-stack-sm">
                <button className="w-full flex items-center justify-between p-stack-sm bg-error-container text-on-error-container hover:bg-[#ffb4ab] transition-colors rounded-lg border border-error">
                  <span className="font-body-md text-body-md font-semibold">Excuse from Session</span>
                  <span className="material-symbols-outlined">event_busy</span>
                </button>
                <button className="w-full flex items-center justify-between p-stack-sm bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim transition-colors rounded-lg border border-secondary">
                  <span className="font-body-md text-body-md font-semibold">Request More Hours</span>
                  <span className="material-symbols-outlined">more_time</span>
                </button>
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-stack-lg shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-unit">Submit Timesheet</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-stack-md">
                Review your logged hours for this pay period before submitting.
              </p>
              <div className="bg-surface-container-low rounded-lg p-stack-md mb-stack-md border border-outline-variant">
                <div className="flex justify-between items-center mb-unit">
                  <span className="font-body-md text-body-md text-on-surface-variant">Logged:</span>
                  <span className="font-data-mono text-data-mono text-primary font-bold">12.5 hrs</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-body-md text-body-md text-on-surface-variant">Required/Max:</span>
                  <span className="font-data-mono text-data-mono text-on-surface">15.0 hrs</span>
                </div>
              </div>
              <button className="w-full bg-primary text-on-primary font-body-md font-bold py-stack-sm rounded-lg hover:bg-primary-container transition-colors shadow-md">
                Submit Timesheet
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
