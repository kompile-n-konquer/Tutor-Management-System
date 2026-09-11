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
  const [volunteeringId, setVolunteeringId] = useState(null);

  useEffect(() => {
    const fetchUnassignedSessions = async () => {
      try {
        // The endpoint only returns sessions whose tutor excused themselves.
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

    try {
      const response = await api.post(`/sessions/${sessionId}/volunteer`);
      if (response.status !== 201) {
        setError(response.data?.message || "Could not submit your volunteer request. Please try again later.");
        return;
      }
      // The session now has a pending volunteer, so it is no longer unassigned.
      setSessions((previousSessions) => previousSessions.filter((session) => session.id !== sessionId));
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
          Sessions whose tutor excused themselves and still need cover. Volunteering submits a request for approval — it does not assign the session to you straight away.
        </p>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {isLoading ? (
          <p className="font-body-md text-on-surface-variant">Loading available sessions…</p>
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
