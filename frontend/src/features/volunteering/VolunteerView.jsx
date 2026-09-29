import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout.jsx";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import api from "../../utils/axiosInstance.js";
import { formatSessionDate, formatSessionTimeRange, sessionDurationHours } from "../../utils/formatSession.js";

export default function VolunteerView() {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [volunteeringId, setVolunteeringId] = useState(null);

  useEffect(() => {
    const fetchUnassignedSessions = async () => {
      try {
        // The endpoint only returns excused sessions for courses where this
        // tutor's own application mark meets the course minimum.
        const response = await api.get("/sessions/unassigned");
        if (response.status !== 200) {
          setError(response.data?.message || "Could not load volunteer opportunities. Please try again later.");
          return;
        }
        setSessions(response.data);
      } catch {
        setError("Could not load volunteer opportunities. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUnassignedSessions();
  }, []);

  const handleVolunteer = async (sessionId) => {
    setVolunteeringId(sessionId);
    setError("");
    setSuccessMessage("");

    try {
      const response = await api.post(`/sessions/${sessionId}/volunteer`);
      if (response.status !== 201) {
        setError(response.data?.message || "Could not submit your volunteer request. Please try again later.");
        return;
      }
      // The session now waits on the lecturer's decision, so it leaves the open pool.
      setSessions((previousSessions) => previousSessions.filter((session) => session.id !== sessionId));
      setSuccessMessage("Your cover request was sent to the lecturer for approval.");
    } catch {
      setError("Could not submit your volunteer request. Please try again later.");
    } finally {
      setVolunteeringId(null);
    }
  };

  return (
    <AppLayout title="Volunteer View" showSearch={true}>
    <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
      <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-unit">Volunteer Opportunities</h2>
        <p className="font-body-sm text-on-surface-variant mb-stack-md">
          Sessions whose tutor excused themselves and that you are qualified to cover. You only see courses where your application mark meets the course minimum. Volunteering sends a cover request to the lecturer — once approved, the session is assigned to you.
        </p>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {successMessage && (
          <p className="font-body-sm text-primary bg-primary-fixed rounded-lg px-stack-sm py-unit mb-stack-md">
            {successMessage}
          </p>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter" aria-hidden="true">
            {[0, 1, 2, 3].map((card) => (
              <div
                key={card}
                className="animate-pulse p-stack-md border border-surface-variant rounded-lg bg-surface-container-low space-y-stack-sm"
              >
                <div className="h-5 w-48 rounded bg-surface-container-high" />
                <div className="h-4 w-40 rounded bg-surface-container-high/60" />
                <div className="h-4 w-32 rounded bg-surface-container-high/60" />
                <div className="h-10 rounded bg-surface-container-high/60 mt-stack-md" />
              </div>
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="font-body-md text-on-surface-variant">No sessions currently need a volunteer. Check back later.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
            {sessions.map((session) => {
              const course = session.assignment?.course;
              const hours = sessionDurationHours(session);

              return (
                <div key={session.id} className="p-stack-md border border-surface-variant rounded-lg bg-surface-container-low flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-unit">
                      <h3 className="font-headline-md text-body-lg font-bold text-primary">
                        {course ? `${course.courseCode} — ${course.courseName}` : "Tutoring Session"}
                      </h3>
                      {hours !== null && (
                        <span className="bg-secondary-fixed text-on-secondary-container text-xs px-2 py-1 rounded font-data-mono">
                          {hours} {hours === 1 ? "Hour" : "Hours"}
                        </span>
                      )}
                    </div>
                    <p className="font-body-sm text-on-surface-variant font-data-mono">
                      {formatSessionDate(session.date)} · {formatSessionTimeRange(session)}
                    </p>
                    {course && (
                      <p className="font-body-sm text-on-surface-variant font-data-mono mt-unit">
                        Your mark: {session.myCourseMark} · Course minimum: {course.minimumMark}
                      </p>
                    )}
                  </div>
                  <div className="mt-stack-md">
                    <Button
                      onClick={() => handleVolunteer(session.id)}
                      disabled={volunteeringId !== null}
                      loading={volunteeringId === session.id}
                    >
                      Apply to Volunteer
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
    </AppLayout>
  );
}
