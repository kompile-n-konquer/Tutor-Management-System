import { useCallback, useEffect, useState } from "react";
import OnboardingWalkthrough from "../../components/onboarding/OnboardingWalkthrough.jsx";
import useAuth from "../../hooks/useAuth.js";
import { useFirstVisit } from "../../hooks/useFirstVisit.js";
import api from "../../utils/axiosInstance.js";
import TutorDashboardContent from "../tutor-dashboard/TutorDashboardContent.jsx";

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

/**
 * TutorSchedule
 * The tutor's section of the unified Dashboard: the course list, session
 * ledger and the excuse-yourself flow, fed by GET /sessions/mine. Rendering
 * lives in TutorDashboardContent (embedded mode); this container owns the
 * fetching and the excuse state machine.
 */
export default function TutorSchedule() {
  const { userProfile, currentUser, loading: authLoading } = useAuth();
  const { isFirstVisit, markSeen } = useFirstVisit("dashboard");

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
      // The session is now UNASSIGNED — reload so its excuse status is reflected.
      cancelExcuse();
      await fetchMySessions();
    } catch {
      setError("Could not submit your excuse. Please try again later.");
    } finally {
      setIsExcusing(false);
    }
  };

  const handleRetry = () => {
    setIsLoading(true);
    setLoadError("");
    fetchMySessions();
  };

  return (
    <>
      {isFirstVisit && <OnboardingWalkthrough steps={TUTOR_ONBOARDING_STEPS} onDismiss={markSeen} />}

      <TutorDashboardContent
        embedded
        firstName={userProfile?.firstName}
        courses={courses}
        sessions={sessions}
        maxHoursPerWeek={maxHoursPerWeek}
        weekScheduledHours={weekScheduledHours}
        isLoading={isLoading}
        error={error}
        loadError={loadError}
        onRetry={handleRetry}
        excusingSessionId={excusingSessionId}
        excuseReason={excuseReason}
        isExcusing={isExcusing}
        onExcuse={startExcuse}
        onCancelExcuse={cancelExcuse}
        onSubmitExcuse={handleExcuse}
      />
    </>
  );
}
