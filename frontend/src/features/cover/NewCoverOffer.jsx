import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { formatSessionDate, formatSessionTimeRange } from '../../utils/formatSession';

// The directed-offer flow: pick one of your excused sessions, see which
// appointed tutors the platform validates as covers (and why the others are
// blocked), then offer the session to a single tutor.
const NewCoverOffer = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [candidateData, setCandidateData] = useState(null);
  const [selectedNomineeId, setSelectedNomineeId] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const role = currentUser?.role?.toLowerCase();

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (role !== 'tutor') {
      navigate('/');
    }
  }, [currentUser, loading, navigate, role]);

  // Preselect the session when arriving from an "Offer to a tutor" link
  const preselectedSessionId = useMemo(() => searchParams.get('sessionId') || '', [searchParams]);

  useEffect(() => {
    if (loading || !currentUser || role !== 'tutor') return;

    const loadSessions = async () => {
      const response = await execute(() => api.get('/sessions/mine'));
      if (!response) return;
      if (response.status !== 200) {
        setError(response?.data?.message || 'Could not load your sessions. Please refresh the page.');
        setLoaded(true);
        return;
      }
      // Only sessions still waiting for cover can be offered on — once an
      // offer is live the session is OFFERED, and PENDING awaits the lecturer.
      const openSessions = response.data.filter((session) => session.status === 'UNASSIGNED');
      setSessions(openSessions);
      if (preselectedSessionId && openSessions.some((s) => String(s.id) === preselectedSessionId)) {
        setSelectedSessionId(preselectedSessionId);
      }
      setLoaded(true);
    };

    loadSessions();
  }, [currentUser, loading, role, execute, preselectedSessionId]);

  // Recompute eligible tutors whenever the excused session changes. The
  // dependent state is reset in the select's onChange, not here — resetting
  // synchronously inside an effect causes a cascading render.
  useEffect(() => {
    if (!selectedSessionId) return;
    const loadCandidates = async () => {
      const response = await execute(() => api.get(`/sessions/${selectedSessionId}/cover-candidates`));
      if (!response) return;
      if (response.status !== 200) {
        setError(response?.data?.message || 'Could not load cover candidates. Please try again.');
        return;
      }
      setCandidateData(response.data);
    };
    loadCandidates();
  }, [selectedSessionId, execute]);

  if (loading) return null;
  if (!currentUser || role !== 'tutor') return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const response = await execute(() =>
      api.post(`/sessions/${selectedSessionId}/cover-offer`, {
        nomineeId: Number(selectedNomineeId),
      })
    );
    if (!response) return;
    if (response.status === 201) {
      navigate('/cover');
    } else {
      setError(response?.data?.message || 'Could not send the cover offer. Please try again.');
    }
  };

  return (
    <AppLayout title="Offer Session Cover">
      <div className="p-gutter md:p-margin-page max-w-3xl">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Offer Session Cover</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Offer one of your excused sessions to a specific tutor. They must pass the platform&rsquo;s
            validation for that session, and the lecturer approves the hand-over before anything
            moves.
          </p>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <form onSubmit={handleSubmit} className="space-y-stack-lg">
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
              1. Which excused session needs cover?
            </label>
            {!loaded ? (
              <p className="font-body-md text-on-surface-variant py-stack-sm">Loading sessions...</p>
            ) : sessions.length === 0 ? (
              <p className="font-body-md text-on-surface-variant py-stack-sm">
                You have no excused sessions waiting for cover. Excuse yourself from a session
                first, or go back to <span className="text-primary">Cover Requests</span>.
              </p>
            ) : (
              <select
                value={selectedSessionId}
                onChange={(e) => {
                  setSelectedSessionId(e.target.value);
                  setCandidateData(null);
                  setSelectedNomineeId('');
                }}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-stack-sm py-stack-sm font-body-md text-on-surface"
                required
              >
                <option value="">Select a session…</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.course.courseCode} — {formatSessionDate(session.date)} ·{' '}
                    {formatSessionTimeRange(session)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedSessionId && candidateData && (
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-stack-sm">
                2. Who should take it over?
              </label>
              {candidateData.candidates.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-sm">
                  No other tutors are allocated to {candidateData.session.course.courseCode}, so
                  there is nobody to offer this session to yet.
                </p>
              ) : (
                <div className="space-y-stack-sm">
                  {candidateData.candidates.map((candidate) => (
                    <label
                      key={candidate.userId}
                      className={`flex items-start gap-gutter rounded-lg border p-stack-sm transition-colors ${
                        candidate.eligible
                          ? 'cursor-pointer border-outline-variant hover:border-primary/50'
                          : 'opacity-70'
                      } ${
                        String(candidate.userId) === String(selectedNomineeId)
                          ? 'border-primary bg-primary/5'
                          : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="nominee"
                        className="mt-1 accent-primary"
                        disabled={!candidate.eligible}
                        checked={String(candidate.userId) === String(selectedNomineeId)}
                        onChange={() => setSelectedNomineeId(candidate.userId)}
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

          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <div className="flex items-center gap-gutter">
              <Button type="submit" disabled={!selectedNomineeId} loading={isLoading}>
                Send cover offer
              </Button>
              <button
                type="button"
                onClick={() => navigate('/cover')}
                className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </AppLayout>
  );
};

export default NewCoverOffer;
