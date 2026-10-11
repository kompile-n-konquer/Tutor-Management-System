import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import { formatSessionDate, formatSessionTimeRange } from '../../utils/formatSession';
import { coverStatusBadge, coverStatusLabel } from './coverFormat';

// The session cell shared by every table, mirroring the tutor cover hub.
// Lecturer feed rows do not nest their course, so the parent list below
// flattens the course identity onto each row.
const SessionCell = ({ session }) => (
  <td className="py-stack-sm px-stack-md">
    <span className="font-bold text-primary">{session.courseCode}</span>
    <span className="text-on-surface-variant"> — {session.courseName}</span>
    <p className="font-body-sm text-outline mt-1">
      {formatSessionDate(session.date)} · {formatSessionTimeRange(session)}
    </p>
  </td>
);

const StatusPill = ({ status }) => (
  <span className={`${coverStatusBadge(status)} px-2 py-1 rounded text-xs font-semibold`}>
    {coverStatusLabel(status)}
  </span>
);

// The lecturer's cover hub: every cover request across their courses, from
// "excused and waiting" through "waiting on the nominee" and "waiting on my
// decision" to confirmed upcoming covers. Open states show regardless of
// date so nothing gets stuck; confirmed covers are upcoming only, otherwise
// the list would grow without bound.
const LecturerCover = () => {
  const [courses, setCourses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      const response = await api.get('/sessions/lecturer');
      if (response.status !== 200) {
        setError(
          response.data?.message || 'Could not load the cover requests. Please refresh the page.',
        );
      } else {
        setCourses(response.data?.courses ?? []);
        setError('');
      }
    } catch {
      setError('Could not load the cover requests. Please refresh the page.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Wrapped so no state updates run synchronously inside the effect.
    (async () => {
      await fetchRequests();
    })();
  }, [fetchRequests]);

  // The lecturer feed nests lifecycle sessions under each course; flatten
  // them into one date-ordered list, pinning the course identity on each row.
  const requests = courses
    .flatMap((course) =>
      (course.sessions ?? []).map((session) => ({
        ...session,
        courseCode: course.courseCode,
        courseName: course.courseName,
      })),
    )
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const awaitingApproval = requests.filter((session) => session.status === 'PENDING');
  const awaitingNominee = requests.filter((session) => session.status === 'OFFERED');
  const needingVolunteer = requests.filter((session) => session.status === 'UNASSIGNED');
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const confirmed = requests.filter(
    (session) =>
      session.status === 'SCHEDULED' &&
      session.volunteerRequest?.status === 'APPROVED' &&
      new Date(session.date).getTime() >= startOfToday.getTime(),
  );

  // Approve/reject a pending cover request; the list refetches so the row
  // moves to the right section (or disappears) immediately.
  const decide = async (sessionId, decision) => {
    setBusyId(sessionId);
    setDecisionError('');
    try {
      const response = await api.patch(`/sessions/${sessionId}/volunteer`, { decision });
      if (response.status !== 200) {
        setDecisionError(
          response.data?.message || 'Could not update the cover request. Please try again later.',
        );
        return;
      }
      await fetchRequests();
    } catch {
      setDecisionError('Could not update the cover request. Please try again later.');
    } finally {
      setBusyId(null);
    }
  };

  const decisionButtons = (session) => (
    <td className="py-stack-sm px-stack-md text-right">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => decide(session.id, 'APPROVED')}
          className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50"
        >
          {busyId === session.id ? 'Working…' : 'Approve cover'}
        </button>
        <button
          type="button"
          disabled={busyId !== null}
          onClick={() => decide(session.id, 'REJECTED')}
          className="bg-error/10 text-error px-3 py-1 rounded text-xs font-semibold hover:bg-error hover:text-on-error transition-colors disabled:opacity-50"
        >
          {busyId === session.id ? 'Working…' : 'Reject'}
        </button>
      </div>
    </td>
  );

  return (
    <AppLayout title="Cover Requests">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Cover Requests</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Every cover request across your courses. A tutor excuses a session, cover arrives
            through the volunteer pool or a directed offer from the excusing tutor, and you give
            the final approval.
          </p>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {decisionError && <ErrorMessage>{decisionError}</ErrorMessage>}

        {!loaded ? (
          <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
            Loading cover requests...
          </p>
        ) : (
          <>
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Awaiting your approval
              </h3>
              {awaitingApproval.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  Nothing is waiting for your approval.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Excused by</th>
                        <th className="py-stack-sm px-stack-md">Cover requested by</th>
                        <th className="py-stack-sm px-stack-md">Reason</th>
                        <th className="py-stack-sm px-stack-md"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {awaitingApproval.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.tutorName ?? 'Unassigned tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {session.volunteerRequest?.volunteerName ?? 'A tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
                            {session.excuseReason ?? '—'}
                          </td>
                          {decisionButtons(session)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Offers awaiting the tutor&rsquo;s response
              </h3>
              {awaitingNominee.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  No directed offers are waiting on a tutor&rsquo;s response.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Excused by</th>
                        <th className="py-stack-sm px-stack-md">Offered to</th>
                        <th className="py-stack-sm px-stack-md">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {awaitingNominee.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.tutorName ?? 'Unassigned tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {session.volunteerRequest?.volunteerName ?? 'A tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
                            {session.excuseReason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Still needing a volunteer
              </h3>
              {needingVolunteer.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  No sessions are waiting for a volunteer.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Excused by</th>
                        <th className="py-stack-sm px-stack-md">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {needingVolunteer.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.tutorName ?? 'Unassigned tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
                            {session.excuseReason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="font-body-sm text-on-surface-variant mt-stack-sm">
                    Eligible tutors pick these up from the Volunteer View.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Confirmed upcoming covers
              </h3>
              {confirmed.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  No confirmed covers coming up.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Covered by</th>
                        <th className="py-stack-sm px-stack-md">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {confirmed.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.volunteerRequest?.volunteerName ??
                              session.tutorName ??
                              'A tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <StatusPill status={session.volunteerRequest.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
};

export default LecturerCover;
