import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate, formatSlot } from './swapFormat';

// The create flow: pick one of your claimed sessions, see which tutors the
// platform validates as eligible partners (and why the others are blocked),
// optionally ask for one of the partner's sessions back, then submit.
const NewSwap = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [sessions, setSessions] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [candidateData, setCandidateData] = useState(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [returnEntryId, setReturnEntryId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const role = currentUser?.role?.toLowerCase();

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (role !== 'tutor') {
      navigate(role === 'organiser' || role === 'admin' ? '/swap-review' : '/');
    }
  }, [currentUser, loading, navigate, role]);

  // Preselect the session when arriving from an "Offer swap" link
  const preselectedEventId = useMemo(() => searchParams.get('eventId') || '', [searchParams]);

  useEffect(() => {
    if (loading || !currentUser || role !== 'tutor') return;

    const loadSessions = async () => {
      const response = await execute(() => api.get('/swaps/my-sessions'));
      if (!response) {
        setError('Could not load your sessions. Please try again.');
        setLoaded(true);
        return;
      }
      if (response.status !== 200) {
        setError(response?.data?.message || 'Could not load your sessions. Please refresh the page.');
        setLoaded(true);
        return;
      }
      setSessions(response.data);
      if (preselectedEventId && response.data.some((s) => String(s.eventId) === preselectedEventId)) {
        setSelectedEventId(preselectedEventId);
      }
      setLoaded(true);
    };

    loadSessions();
  }, [currentUser, loading, role, execute, preselectedEventId, reloadKey]);

  // Recompute eligible partners whenever the offered session changes. The
  // dependent state is reset in the select's onChange, not here — resetting
  // synchronously inside an effect causes a cascading render.
  useEffect(() => {
    if (!selectedEventId) return;
    const loadCandidates = async () => {
      const response = await execute(() => api.get(`/swaps/candidates/${selectedEventId}`));
      if (!response) return;
      if (response.status !== 200) {
        setError(response?.data?.message || 'Could not load swap candidates. Please try again.');
        return;
      }
      setCandidateData(response.data);
    };
    loadCandidates();
  }, [selectedEventId, execute]);

  if (loading) return null;
  if (!currentUser || role !== 'tutor') return null;

  const selectedRecipient = candidateData?.candidates?.find(
    (candidate) => String(candidate.userId) === String(selectedRecipientId)
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const response = await execute(() =>
      api.post('/swaps', {
        recipientId: Number(selectedRecipientId),
        requesterEventId: Number(selectedEventId),
        recipientEventId: returnEntryId ? Number(returnEntryId) : undefined,
        reason,
      })
    );
    if (!response) return;
    if (response.status === 201) {
      navigate('/swaps');
    } else {
      setError(response?.data?.message || 'Could not create the swap request. Please try again.');
    }
  };

  return (
    <AppLayout title="Offer a Session Swap">
      <div className="p-gutter md:p-margin-page max-w-3xl">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Offer a Session Swap</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Trade one of your claimed sessions with another tutor. Constraints are validated before
            the request is sent, and the organiser approves the trade before anything moves.
          </p>
        </div>

        {error && (
          <div className="space-y-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            {loaded && sessions.length === 0 && (
              <Button
                className="min-w-32"
                onClick={() => {
                  setError('');
                  setLoaded(false);
                  setReloadKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-stack-lg">
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
              1. Which session do you want to trade away?
            </label>
            {!loaded ? (
              <p className="font-body-md text-on-surface-variant py-stack-sm">Loading sessions...</p>
            ) : !error && sessions.length === 0 ? (
              <p className="font-body-md text-on-surface-variant py-stack-sm">
                You have no claimed sessions to offer. Claim a session on your timesheet first, or
                go back to <span className="text-primary">Session Swaps</span>.
              </p>
            ) : (
              <select
                value={selectedEventId}
                onChange={(e) => {
                  setSelectedEventId(e.target.value);
                  setCandidateData(null);
                  setSelectedRecipientId('');
                  setReturnEntryId('');
                }}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-stack-sm py-stack-sm font-body-md text-on-surface"
                required
              >
                <option value="">Select a session…</option>
                {sessions.map((session) => (
                  <option key={session.eventId} value={session.eventId}>
                    {session.courseCode} — {formatSessionDate(session.date)} ·{' '}
                    {session.slots.map(formatSlot).join(', ')}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedEventId && candidateData && (
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
                2. Who should take it over?
              </label>
              {isLoading && !candidateData.candidates ? (
                <p className="font-body-md text-on-surface-variant py-stack-sm">Checking tutors…</p>
              ) : candidateData.candidates.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-sm">
                  No other tutors are allocated to {candidateData.session.courseCode}, so there is
                  nobody to swap with yet.
                </p>
              ) : (
                <div className="space-y-stack-sm">
                  {candidateData.candidates.map((candidate) => (
                    <label
                      key={candidate.userId}
                      className={`flex items-start gap-gutter rounded-lg border p-stack-sm cursor-pointer transition-colors ${
                        String(candidate.userId) === String(selectedRecipientId)
                          ? 'border-primary bg-primary/5'
                          : 'border-outline-variant hover:border-primary/50'
                      } ${!candidate.eligible ? 'opacity-70' : ''}`}
                    >
                      <input
                        type="radio"
                        name="recipient"
                        className="mt-1 accent-primary"
                        checked={String(candidate.userId) === String(selectedRecipientId)}
                        onChange={() => {
                          setSelectedRecipientId(candidate.userId);
                          setReturnEntryId('');
                        }}
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-gutter">
                          <span className="font-body-md font-semibold text-on-surface">{candidate.name}</span>
                          {candidate.eligible ? (
                            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-semibold">
                              Eligible
                            </span>
                          ) : (
                            <span className="bg-error/10 text-error px-2 py-0.5 rounded text-xs font-semibold">
                              Blocked by constraints
                            </span>
                          )}
                        </span>
                        {!candidate.eligible && (
                          <ul className="font-body-sm text-error mt-1 list-disc list-inside">
                            {candidate.reasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedRecipient && selectedRecipient.sessions.length > 0 && (
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
                3. Want one of {selectedRecipient.name.split(' ')[0]}&rsquo;s sessions in return?
                (optional — one-way if left empty)
              </label>
              <select
                value={returnEntryId}
                onChange={(e) => setReturnEntryId(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-stack-sm py-stack-sm font-body-md text-on-surface"
              >
                <option value="">No — they just take my session (one-way)</option>
                {selectedRecipient.sessions.map((session) => (
                  <option key={session.eventId} value={session.eventId} disabled={!session.eligible}>
                    {session.courseCode} — {formatSessionDate(session.date)} ·{' '}
                    {session.slots.map(formatSlot).join(', ')}
                    {session.eligible ? '' : ' (blocked by constraints)'}
                  </option>
                ))}
              </select>
              {returnEntryId &&
                (() => {
                  const picked = selectedRecipient.sessions.find(
                    (s) => String(s.eventId) === String(returnEntryId)
                  );
                  return picked && !picked.eligible ? (
                    <p className="font-body-sm text-error mt-2">
                      This return session does not pass validation for you: {picked.reasons.join('; ')}.
                    </p>
                  ) : null;
                })()}
            </div>
          )}

          {selectedRecipientId && (
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
                Message (optional)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. I have a class clash that day — can you cover me?"
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-stack-sm py-stack-sm font-body-md text-on-surface"
              />
              <div className="mt-stack-md flex items-center gap-gutter">
                <Button type="submit" loading={isLoading}>
                  Send swap request
                </Button>
                <button
                  type="button"
                  onClick={() => navigate('/swaps')}
                  className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </AppLayout>
  );
};

export default NewSwap;
