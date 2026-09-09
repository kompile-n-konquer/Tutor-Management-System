import React, { useCallback, useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout.jsx";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import api from "../../utils/axiosInstance.js";
import { formatSessionDate, formatSessionTime } from "../../utils/formatSession.js";

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
    <AppLayout role="tutor" title="Tutor Dashboard" showSearch={true}>
    <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
      {/* Top Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Allocated Hours</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-primary mt-unit">18 / 20 hrs</h3>
          </div>
          <span className="material-symbols-outlined text-primary text-3xl">schedule</span>
        </div>

        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Active Courses</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface mt-unit">2 Assigned</h3>
          </div>
          <span className="material-symbols-outlined text-trust-blue text-3xl">book</span>
        </div>

        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Timesheet Status</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-trust-blue mt-unit">Approved</h3>
          </div>
          <span className="material-symbols-outlined text-trust-blue text-3xl">verified</span>
        </div>
      </div>

      {/* Schedule & Tasks Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">Assigned Tutoring Sessions</h2>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                <th className="py-stack-sm px-stack-md">Course</th>
                <th className="py-stack-sm px-stack-md">Date / Time</th>
                <th className="py-stack-sm px-stack-md">Status</th>
                <th className="py-stack-sm px-stack-md">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant font-body-md">
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
                          {formatSessionDate(session.date)} / {formatSessionTime(session.startTime)} – {formatSessionTime(session.endTime)}
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
                                  className="px-4 py-3 rounded-DEFAULT font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container transition-colors"
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
    </main>
    </AppLayout>
  );
}
