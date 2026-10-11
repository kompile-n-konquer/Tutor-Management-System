import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate, formatSlot, swapStatusBadge, swapStatusLabel } from './swapFormat';

// One row of the swap tables: which session moves where, the other tutor, the
// status and — while an action is still allowed — the matching buttons.
const SwapRow = ({ swap, currentUserId, onAccept, onDecline, onCancel, busy }) => {
  const isRecipient = swap.recipient.userId === currentUserId;
  const isRequester = swap.requester.userId === currentUserId;
  const otherTutor = isRecipient ? swap.requester : swap.recipient;

  return (
    <tr>
      <td className="py-stack-sm px-stack-md">
        <span className="font-bold text-primary">{swap.offeredSession.courseCode}</span>
        <span className="text-on-surface-variant"> — {swap.offeredSession.courseName}</span>
        <p className="font-body-sm text-outline mt-1">
          {formatSessionDate(swap.offeredSession.date)} ·{' '}
          {swap.offeredSession.slots.map(formatSlot).join(', ')}
        </p>
        {swap.requestedSession && (
          <p className="font-body-sm text-outline mt-1">
            In return: <span className="font-semibold">{swap.requestedSession.courseCode}</span> —{' '}
            {formatSessionDate(swap.requestedSession.date)} ·{' '}
            {swap.requestedSession.slots.map(formatSlot).join(', ')}
          </p>
        )}
      </td>
      <td className="py-stack-sm px-stack-md">
        {otherTutor.name}
        <p className="font-body-sm text-outline mt-1">{otherTutor.email}</p>
      </td>
      <td className="py-stack-sm px-stack-md font-body-sm text-on-surface-variant">
        {isRequester ? 'You offered this session' : 'Offered to you'}
        {swap.reason && <p className="mt-1">“{swap.reason}”</p>}
      </td>
      <td className="py-stack-sm px-stack-md">
        <span className={`${swapStatusBadge(swap.status)} px-2 py-1 rounded text-xs font-semibold`}>
          {swapStatusLabel(swap.status)}
        </span>
        {swap.rejectionReason && (
          <p className="font-body-sm text-error mt-1">{swap.rejectionReason}</p>
        )}
      </td>
      <td className="py-stack-sm px-stack-md">
        {isRecipient && swap.status === 'PENDING' && (
          <div className="flex flex-col gap-1">
            <button
              disabled={busy}
              onClick={() => onAccept(swap.id)}
              className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors"
            >
              Accept
            </button>
            <button
              disabled={busy}
              onClick={() => onDecline(swap.id)}
              className="bg-error/10 text-error px-3 py-1 rounded text-xs font-semibold hover:bg-error hover:text-on-error transition-colors"
            >
              Decline
            </button>
          </div>
        )}
        {isRequester && swap.status === 'PENDING' && (
          <button
            disabled={busy}
            onClick={() => onCancel(swap.id)}
            className="bg-surface-variant text-on-surface-variant px-3 py-1 rounded text-xs font-semibold hover:bg-error/10 hover:text-error transition-colors"
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
};

const Swaps = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [sessions, setSessions] = useState([]);
  const [swaps, setSwaps] = useState([]);
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
      navigate(role === 'organiser' || role === 'admin' ? '/swap-review' : '/');
    }
  }, [currentUser, loading, navigate, role]);

  const fetchData = useCallback(async () => {
    const [sessionsResponse, swapsResponse] = await execute(() =>
      Promise.all([api.get('/swaps/my-sessions'), api.get('/swaps')])
    );
    if (!sessionsResponse || !swapsResponse) return;
    if (sessionsResponse.status !== 200) {
      setError(sessionsResponse?.data?.message || 'Could not load your sessions. Please refresh the page.');
      return;
    }
    setSessions(sessionsResponse.data);
    if (swapsResponse.status === 200) {
      setSwaps(swapsResponse.data);
      setError('');
    } else {
      setError(swapsResponse?.data?.message || 'Could not load your swap requests. Please refresh the page.');
    }
    setLoaded(true);
  }, [execute]);

  useEffect(() => {
    if (loading || !currentUser || role !== 'tutor') return;
    const load = async () => { await fetchData(); };
    load();
  }, [currentUser, loading, role, fetchData]);

  if (loading) return null;
  if (!currentUser || role !== 'tutor') return null;

  const respond = async (id, action, body) => {
    setBusyId(id);
    setActionError('');
    const response = await execute(() => api.post(`/swaps/${id}/${action}`, body));
    setBusyId(null);
    if (response?.status === 200) {
      fetchData();
    } else {
      setActionError(response?.data?.message || 'That action failed. Please try again.');
    }
  };

  const handleAccept = (id) => respond(id, 'accept');
  const handleCancel = (id) => respond(id, 'cancel');
  const handleDecline = (id) => {
    // Optional free-text reason surfaced to the requester by email and on this page
    const reason = window.prompt('Optionally tell the other tutor why you are declining:');
    if (reason === null) return;
    respond(id, 'decline', { reason });
  };

  const received = swaps.filter((swap) => swap.recipient.userId === currentUser.id);
  const sent = swaps.filter((swap) => swap.requester.userId === currentUser.id);
  const activeSessions = sessions;

  return (
    <AppLayout title="Session Swaps">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Session Swaps</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Trade a session you have claimed with another tutor. The platform checks every swap
              against the allocation constraints, and the organiser gives the final approval.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            <button
              type="button"
              onClick={() => {
                setError('');
                fetchData();
              }}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}
        {actionError && <ErrorMessage>{actionError}</ErrorMessage>}

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">My Sessions</h3>
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading sessions...</p>
          ) : activeSessions.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              You have no claimed sessions available for swapping. Sessions appear here once you
              claim them on your timesheet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Session</th>
                    <th className="py-stack-sm px-stack-md">Date</th>
                    <th className="py-stack-sm px-stack-md">Time</th>
                    <th className="py-stack-sm px-stack-md">Duration</th>
                    <th className="py-stack-sm px-stack-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {activeSessions.map((session) => (
                    <tr key={session.eventId}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{session.courseCode}</span>
                        <span className="text-on-surface-variant"> — {session.courseName}</span>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatSessionDate(session.date)}
                      </td>
                      <td className="py-stack-sm px-stack-md">{session.slots.map(formatSlot).join(', ')}</td>
                      <td className="py-stack-sm px-stack-md font-data-mono">{session.duration} h</td>
                      <td className="py-stack-sm px-stack-md text-right">
                        <Link
                          to={`/swaps/new?eventId=${session.eventId}`}
                          className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors"
                        >
                          Offer swap
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
            Swap Requests Requiring Your Response
          </h3>
          {!loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading...</p>
          ) : received.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No swap requests have been offered to you.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Session</th>
                    <th className="py-stack-sm px-stack-md">From</th>
                    <th className="py-stack-sm px-stack-md">Details</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                    <th className="py-stack-sm px-stack-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {received.map((swap) => (
                    <SwapRow
                      key={swap.id}
                      swap={swap}
                      currentUserId={currentUser.id}
                      onAccept={handleAccept}
                      onDecline={handleDecline}
                      onCancel={handleCancel}
                      busy={busyId === swap.id || isLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
            Swaps You Requested
          </h3>
          {!loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading...</p>
          ) : sent.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              You have not requested any swaps yet. Pick one of your sessions above to offer it to
              another tutor.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Session</th>
                    <th className="py-stack-sm px-stack-md">Offered to</th>
                    <th className="py-stack-sm px-stack-md">Details</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                    <th className="py-stack-sm px-stack-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {sent.map((swap) => (
                    <SwapRow
                      key={swap.id}
                      swap={swap}
                      currentUserId={currentUser.id}
                      onAccept={handleAccept}
                      onDecline={handleDecline}
                      onCancel={handleCancel}
                      busy={busyId === swap.id || isLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Swaps;
