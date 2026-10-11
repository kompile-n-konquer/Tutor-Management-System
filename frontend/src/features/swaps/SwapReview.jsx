import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate, formatSlot, swapStatusBadge, swapStatusLabel } from './swapFormat';

const SwapReview = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [swaps, setSwaps] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const role = currentUser?.role?.toLowerCase();
  const canReview = role === 'organiser' || role === 'admin';

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!canReview) {
      navigate(role === 'tutor' ? '/swaps' : '/');
    }
  }, [currentUser, loading, navigate, role, canReview]);

  const load = useCallback(async () => {
    const response = await execute(() => api.get('/swaps'));
    if (!response) {
      setError('Could not load swap requests. Please try again.');
      setLoaded(true);
      return;
    }
    if (response.status !== 200) {
      setError(response?.data?.message || 'Could not load swap requests. Please refresh the page.');
    } else {
      setSwaps(response.data);
      setError('');
    }
    setLoaded(true);
  }, [execute]);

  useEffect(() => {
    if (loading || !currentUser || !canReview) return;
    const loadSwaps = async () => { await load(); };
    loadSwaps();
  }, [currentUser, loading, canReview, load]);

  if (loading) return null;
  if (!currentUser || !canReview) return null;

  const review = async (id, action) => {
    setBusyId(id);
    setActionError('');
    const response = await execute(() => api.post(`/swaps/${id}/${action}`));
    setBusyId(null);
    if (response?.status === 200) {
      load();
    } else {
      // 409 responses carry the constraint failures so the organiser sees why
      setActionError(response?.data?.message || 'That action failed. Please try again.');
    }
  };

  const handleApprove = (id) => review(id, 'approve');
  const handleReject = (id) => {
    const reason = window.prompt('Optionally record why you are rejecting this swap:');
    if (reason === null) return;
    setBusyId(id);
    setActionError('');
    execute(() => api.post(`/swaps/${id}/reject`, { reason })).then((response) => {
      setBusyId(null);
      if (response?.status === 200) {
        load();
      } else {
        setActionError(response?.data?.message || 'That action failed. Please try again.');
      }
    });
  };

  const awaitingReview = swaps.filter((swap) => swap.status === 'ACCEPTED');
  const inProgress = swaps.filter((swap) => swap.status === 'PENDING');
  const decided = swaps.filter((swap) =>
    ['APPROVED', 'REJECTED', 'CANCELLED'].includes(swap.status)
  );

  const renderTable = (rows, { actionable = false } = {}) => (
    <div className="overflow-x-auto">
      <table className="responsive-table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
            <th className="py-stack-sm px-stack-md">Sessions</th>
            <th className="py-stack-sm px-stack-md">Tutors</th>
            <th className="py-stack-sm px-stack-md">Requested</th>
            <th className="py-stack-sm px-stack-md">Status</th>
            {actionable && <th className="py-stack-sm px-stack-md"></th>}
          </tr>
        </thead>
        <tbody className="font-body-md">
          {rows.map((swap) => (
            <tr key={swap.id}>
              <td data-label="Sessions" className="py-stack-sm px-stack-md">
                <span className="cell-stack">
                  <span>
                    <span className="font-bold text-primary">{swap.offeredSession.courseCode}</span>
                    <span className="text-on-surface-variant"> — {swap.offeredSession.courseName}</span>
                  </span>
                  <p className="font-body-sm text-outline mt-1">
                    {formatSessionDate(swap.offeredSession.date)} ·{' '}
                    {swap.offeredSession.slots.map(formatSlot).join(', ')}
                  </p>
                  {swap.requestedSession ? (
                    <p className="font-body-sm text-outline mt-1">
                      Two-way: <span className="font-semibold">{swap.requestedSession.courseCode}</span>{' '}
                      — {formatSessionDate(swap.requestedSession.date)} ·{' '}
                      {swap.requestedSession.slots.map(formatSlot).join(', ')}
                    </p>
                  ) : (
                    <p className="font-body-sm text-outline mt-1">One-way handover</p>
                  )}
                </span>
              </td>
              <td data-label="Tutors" className="py-stack-sm px-stack-md">
                <span className="cell-stack">
                  <span>
                    {swap.requester.name} <span className="text-outline">gives</span>
                  </span>
                  <span>
                    {swap.recipient.name} <span className="text-outline">receives</span>
                  </span>
                  {swap.reason && <p className="font-body-sm text-outline mt-1">“{swap.reason}”</p>}
                </span>
              </td>
              <td data-label="Requested" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                {formatSessionDate(swap.requestedAt)}
              </td>
              <td data-label="Status" className="py-stack-sm px-stack-md">
                <span className={`${swapStatusBadge(swap.status)} px-2 py-1 rounded text-xs font-semibold`}>
                  {swapStatusLabel(swap.status)}
                </span>
                {swap.rejectionReason && (
                  <p className="font-body-sm text-error mt-1">{swap.rejectionReason}</p>
                )}
              </td>
              {actionable && (
                <td className="py-stack-sm px-stack-md">
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={busyId === swap.id || isLoading}
                      onClick={() => handleApprove(swap.id)}
                      className="bg-primary/10 text-primary px-3 py-1 rounded text-xs font-semibold hover:bg-primary hover:text-on-primary transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busyId === swap.id || isLoading}
                      onClick={() => handleReject(swap.id)}
                      className="bg-error/10 text-error px-3 py-1 rounded text-xs font-semibold hover:bg-error hover:text-on-error transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppLayout title="Swap Requests">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Swap Requests</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Session trades both tutors have agreed on. Approve to move the sessions, or reject to
            leave them with their current tutors. Constraints are re-validated on every approval.
          </p>
        </div>

        {error && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            <button
              type="button"
              onClick={() => {
                setError('');
                setLoaded(false);
                load();
              }}
              className="bg-primary text-on-primary px-4 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}
        {actionError && <ErrorMessage>{actionError}</ErrorMessage>}

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
            Awaiting Your Review
          </h3>
          {!loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading...</p>
          ) : !error && awaitingReview.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No agreed swaps are waiting for organiser approval.
            </p>
          ) : (
            renderTable(awaitingReview, { actionable: true })
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">
            Waiting for the Other Tutor
          </h3>
          {!loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading...</p>
          ) : !error && inProgress.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No swap requests are waiting for a tutor's response.
            </p>
          ) : (
            renderTable(inProgress)
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-sm">History</h3>
          {!loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading...</p>
          ) : !error && decided.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No swap requests have been decided yet.
            </p>
          ) : (
            renderTable(decided)
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default SwapReview;
