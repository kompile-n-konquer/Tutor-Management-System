import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate, formatSessionTimeRange } from '../../utils/formatSession';
import { coverStatusBadge, coverStatusLabel } from './coverFormat';

// The session cell shared by every table: course, date and slot. The course
// code and name stay in separate spans, matching the tutor dashboard's rows.
const SessionCell = ({ session }) => (
  <td className="py-stack-sm px-stack-md">
    <span className="font-bold text-primary">{session.course.courseCode}</span>
    <span className="text-on-surface-variant"> — {session.course.courseName}</span>
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

// The tutor's cover hub: the directed offers waiting on their response, their
// own excused sessions still needing cover, the offers they sent out, and
// everything now sitting with the lecturer.
const Cover = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [mySessions, setMySessions] = useState([]);
  const [volunteered, setVolunteered] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const role = currentUser?.role?.toLowerCase();

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (role !== 'tutor') {
      navigate('/');
    }
  }, [currentUser, loading, navigate, role]);

  const fetchData = useCallback(async () => {
    const sessionsResponse = await execute(() => api.get('/sessions/mine'));
    // A failed volunteer feed only empties the nominee sections — the excuser
    // side of the page still works.
    const volunteeredResponse = await execute(() => api.get('/sessions/volunteered'));
    // execute resolves to undefined when the request itself throws.
    if (!sessionsResponse) {
      setError('Could not load your cover requests. Please refresh the page.');
      setLoaded(true);
      return;
    }
    if (sessionsResponse.status !== 200) {
      setError(
        sessionsResponse?.data?.message || 'Could not load your sessions. Please refresh the page.'
      );
    } else {
      setMySessions(sessionsResponse.data);
    }
    setVolunteered(volunteeredResponse?.status === 200 ? volunteeredResponse.data?.sessions ?? [] : []);
    setLoaded(true);
  }, [execute]);

  useEffect(() => {
    if (loading || !currentUser || role !== 'tutor') return;
    const load = async () => {
      await fetchData();
    };
    load();
  }, [currentUser, loading, role, fetchData]);

  if (loading) return null;
  if (!currentUser || role !== 'tutor') return null;

  const respond = async (sessionId, decision) => {
    setBusyId(sessionId);
    setActionError('');
    const response = await execute(() =>
      api.patch(`/sessions/${sessionId}/cover-offer`, { decision })
    );
    setBusyId(null);
    if (response?.status === 200) {
      fetchData();
    } else {
      setActionError(response?.data?.message || 'That action failed. Please try again.');
    }
  };

  const withdraw = async (sessionId) => {
    setBusyId(sessionId);
    setActionError('');
    const response = await execute(() => api.delete(`/sessions/${sessionId}/cover-offer`));
    setBusyId(null);
    if (response?.status === 200) {
      fetchData();
    } else {
      setActionError(response?.data?.message || 'That action failed. Please try again.');
    }
  };

  const incomingOffers = volunteered.filter((session) => session.volunteerStatus === 'OFFERED');
  const excusedSessions = mySessions.filter((session) => session.status === 'UNASSIGNED');
  const sentOffers = mySessions.filter((session) => session.status === 'OFFERED');
  const awaitingLecturer = [
    ...mySessions
      .filter((session) => session.status === 'PENDING')
      .map((session) => ({
        key: `mine-${session.id}`,
        session,
        note: session.volunteerRequest?.tutorName
          ? `Covered by ${session.volunteerRequest.tutorName}`
          : 'A covering tutor has been found',
      })),
    ...volunteered
      .filter((session) => session.volunteerStatus === 'PENDING')
      .map((session) => ({
        key: `volunteered-${session.id}`,
        session,
        note: 'You are set to cover this session',
      })),
  ];

  const isBusy = (id) => busyId === id || isLoading;

  return (
    <AppLayout title="Cover Requests">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Cover Requests</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Excused a session? Offer it to one specific tutor — the platform validates the
              choice against their timetable, the nominated tutor accepts or declines, and the
              lecturer gives the final approval.
            </p>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {actionError && <ErrorMessage>{actionError}</ErrorMessage>}

        {!loaded ? (
          <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
            Loading cover requests...
          </p>
        ) : (
          <>
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Cover offers waiting on you
              </h3>
              {incomingOffers.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  No cover offers are waiting on your response.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Excused by</th>
                        <th className="py-stack-sm px-stack-md"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {incomingOffers.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.ledBy ?? 'A tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <div className="flex flex-col gap-1">
                              <button
                                disabled={isBusy(session.id)}
                                onClick={() => respond(session.id, 'ACCEPT')}
                                className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors"
                              >
                                Accept
                              </button>
                              <button
                                disabled={isBusy(session.id)}
                                onClick={() => respond(session.id, 'DECLINE')}
                                className="bg-error/10 text-error px-3 py-1 rounded text-xs font-semibold hover:bg-error hover:text-on-error transition-colors"
                              >
                                Decline
                              </button>
                            </div>
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
                Sessions you excused that still need cover
              </h3>
              {excusedSessions.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  No excused sessions are waiting for cover.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Reason</th>
                        <th className="py-stack-sm px-stack-md"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {excusedSessions.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
                            {session.excuseReason ?? '—'}
                          </td>
                          <td className="py-stack-sm px-stack-md text-right">
                            <Link
                              to={`/cover/new?sessionId=${session.id}`}
                              className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors"
                            >
                              Offer to a tutor
                            </Link>
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
                Cover offers you sent
              </h3>
              {sentOffers.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  You have not offered any sessions to anyone yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Offered to</th>
                        <th className="py-stack-sm px-stack-md">Status</th>
                        <th className="py-stack-sm px-stack-md"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {sentOffers.map((session) => (
                        <tr key={session.id}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md">
                            {session.volunteerRequest?.tutorName ?? 'A tutor'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <StatusPill status={session.status} />
                          </td>
                          <td className="py-stack-sm px-stack-md text-right">
                            <button
                              disabled={isBusy(session.id)}
                              onClick={() => withdraw(session.id)}
                              className="bg-surface-variant text-on-surface-variant px-3 py-1 rounded text-xs font-semibold hover:bg-error/10 hover:text-error transition-colors"
                            >
                              Withdraw
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
                Awaiting the lecturer&rsquo;s decision
              </h3>
              {awaitingLecturer.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                  Nothing is waiting on the lecturer right now.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Session</th>
                        <th className="py-stack-sm px-stack-md">Details</th>
                        <th className="py-stack-sm px-stack-md">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {awaitingLecturer.map(({ key, session, note }) => (
                        <tr key={key}>
                          <SessionCell session={session} />
                          <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
                            {note}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <StatusPill status={session.status} />
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

export default Cover;
