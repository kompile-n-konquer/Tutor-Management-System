import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import Input from '../../components/input/Input';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SlotGrid from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

// Builds the SlotGrid grid map from a course's slots: { [slotId]: { [day]: 'selected' | 'locked' | 'empty' } }
// Locked course slots are already held by the student's other submitted applications
const buildGrid = (timeSlots, courseSlots, lockedSlots = []) => {
  const grid = {};
  timeSlots.forEach((slot) => {
    grid[slot.id] = { 0: 'empty', 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' };
  });
  courseSlots.forEach((slot) => {
    if (grid[slot.timeSlotId]) {
      grid[slot.timeSlotId][slot.dayOfWeek] = 'selected';
    }
  });
  lockedSlots.forEach((slot) => {
    if (grid[slot.timeSlotId]) {
      grid[slot.timeSlotId][slot.dayOfWeek] = 'locked';
    }
  });
  return grid;
};

const OpportunityDetails = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [opportunity, setOpportunity] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [grid, setGrid] = useState({});
  const [mark, setMark] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const role = currentUser?.role?.toLowerCase();
  const canApply = role === 'student' || role === 'tutor';

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!canApply) {
      navigate(role === 'lecturer' || role === 'organiser' ? '/courses' : '/tutor-dashboard');
    }
  }, [currentUser, loading, navigate, canApply, role]);

  useEffect(() => {
    if (loading || !currentUser || !canApply) return;

    const loadOpportunity = async () => {
      const [opportunityResponse, slotsResponse] = await execute(() =>
        Promise.all([api.get(`/applications/${courseId}`), api.get('/courses/time-slots')])
      );

      if (!opportunityResponse || !slotsResponse) return;

      if (opportunityResponse.status !== 200) {
        setError(
          opportunityResponse?.data?.message ||
            'Could not load the opportunity. It may no longer be accepting applications.'
        );
        return;
      }
      if (slotsResponse.status !== 200) {
        setError('Could not load the time slots. Please refresh the page.');
        return;
      }

      setOpportunity(opportunityResponse.data);
      setTimeSlots(slotsResponse.data);
      setGrid(
        buildGrid(slotsResponse.data, opportunityResponse.data.slots, opportunityResponse.data.lockedSlots)
      );
      // A mark verified from the uploaded transcript prefills — and locks — the form
      if (opportunityResponse.data.transcriptMark !== null && opportunityResponse.data.transcriptMark !== undefined) {
        setMark(String(opportunityResponse.data.transcriptMark));
      }
      setError('');
    };

    loadOpportunity();
  }, [currentUser, loading, canApply, courseId, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser || !canApply) return null;

  const formatDate = (isoString) =>
    new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // The apply button stays disabled until a valid mark that meets the minimum is entered.
  // A transcript-verified mark fills the field automatically and cannot be edited —
  // the backend also replaces a self-declared mark with the verified one
  const parsedMark = Number(mark);
  const markEntered = mark !== '';
  const markValid = markEntered && !Number.isNaN(parsedMark) && parsedMark >= 0 && parsedMark <= 100;
  const belowMinimum = markValid && parsedMark < opportunity?.minimumMark;
  const canSubmit = markValid && !belowMinimum;
  const markVerified = opportunity?.transcriptMark !== null && opportunity?.transcriptMark !== undefined;

  const handleChange = (event) => {
    setError('');
    if (markVerified) return; // the transcript-verified mark cannot be overridden
    setMark(event.target.value);
  };

  const handleApply = async (event) => {
    event.preventDefault();
    setError('');

    if (!canSubmit) return;

    const response = await execute(() =>
      api.post(`/applications/${courseId}/apply`, { courseMark: parsedMark })
    );

    if (response && response.status === 201) {
      // The applied course no longer counts as an opportunity, so send the student
      // back to the applications page where it is listed under My Applications
      navigate('/applications');
    } else {
      setError(response?.data?.message || 'Could not submit your application. Please try again.');
    }
  };

  return (
    <AppLayout role="student" title="Applications">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">
              {opportunity ? `${opportunity.courseCode}` : 'Opportunity'}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {opportunity ? `${opportunity.courseName} - Tutoring Opportunity` : 'Tutoring opportunity details'}
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate('/applications')}>
              Back to Applications
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            {!opportunity && (
              <Button
                className="min-w-32"
                onClick={() => {
                  setError('');
                  setReloadKey((key) => key + 1);
                }}
              >
                Try again
              </Button>
            )}
          </div>
        )}

        {isLoading && !opportunity && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter" aria-hidden="true">
            <div className="lg:col-span-4 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
              <div className="h-4 w-28 rounded bg-surface-container-high mb-stack-lg" />
              <div className="space-y-stack-lg">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-unit">
                    <div className="h-3 w-16 rounded bg-surface-container-high" />
                    <div className="h-4 rounded bg-surface-container-high/60" />
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-8 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-stack-md">
              <div className="h-4 w-32 rounded bg-surface-container-high" />
              <div className="h-24 rounded bg-surface-container-high/60" />
              <div className="h-24 rounded bg-surface-container-high/60" />
            </div>
          </div>
        )}

        {opportunity && (
          <div className="space-y-gutter">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
              {/* Opportunity details — left column */}
              <div className="lg:col-span-4">
                <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                  <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Opportunity Details
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Core information about this tutoring opportunity.
                    </p>
                  </div>
                  <div className="flex-1 space-y-6">
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Added</p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">
                        {formatDate(opportunity.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Lecturer</p>
                      <p className="font-body-md text-on-surface mt-1">
                        {opportunity.lecturer || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        Minimum Mark
                      </p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">{opportunity.minimumMark}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        Hours per Week
                      </p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">
                        {opportunity.weeklyHours} hour{opportunity.weeklyHours === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tutoring slots — right column */}
              <div className="lg:col-span-8">
                <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                  <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                    <div>
                      <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        Tutoring Slots
                      </h3>
                      <p className="font-body-sm text-outline mt-1">
                        The weekly slots you would tutor this course. They fit your availability.
                      </p>
                    </div>
                    <span className="font-body-sm text-on-surface-variant">
                      {opportunity.slotsCount} slot{opportunity.slotsCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="flex-1 min-h-0">
                    <SlotGrid timeSlots={timeSlots} grid={grid} readOnly label="Tutor" fill />
                  </div>
                </div>
              </div>
            </div>

            {/* Apply — full width at bottom. When accepting the course would push the
                student above the maximum claimable hours, a notice replaces the apply form. */}
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              {opportunity.hoursExceeded ? (
                <>
                  <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
                    You cannot apply for this opportunity
                  </h2>
                  <p className="font-body-md text-on-surface-variant">
                    You are already assigned to{' '}
                    <span className="font-data-mono font-semibold text-on-surface">
                      {opportunity.assignedHours} hour{opportunity.assignedHours === 1 ? '' : 's'}
                    </span>{' '}
                    and tutoring {opportunity.courseCode} would add{' '}
                    <span className="font-data-mono font-semibold text-on-surface">
                      {opportunity.weeklyHours} hour{opportunity.weeklyHours === 1 ? '' : 's'}
                    </span>
                    , bringing you to{' '}
                    <span className="font-data-mono font-semibold text-on-surface">
                      {opportunity.assignedHours + opportunity.weeklyHours} hours
                    </span>
                    . This is above the maximum of{' '}
                    <span className="font-data-mono font-semibold text-on-surface">
                      {opportunity.maxClaimableHours} claimable hour{opportunity.maxClaimableHours === 1 ? '' : 's'}
                    </span>
                    , so you cannot apply for this opportunity.
                  </p>
                </>
              ) : (
                <form onSubmit={handleApply}>
                  <div className="flex flex-wrap items-center justify-between gap-gutter">
                    <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
                      Apply to tutor {opportunity.courseCode}
                    </h2>
                    {markVerified && (
                      <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        Verified from your transcript
                      </span>
                    )}
                  </div>
                  <p className="font-body-md text-on-surface-variant mb-stack-md">
                    {markVerified ? (
                      <>
                        Your transcript verifies a final mark of{' '}
                        <span className="font-data-mono font-semibold text-on-surface">
                          {opportunity.transcriptMark}
                        </span>{' '}
                        for {opportunity.courseCode}. You need at least{' '}
                        <span className="font-data-mono font-semibold text-on-surface">{opportunity.minimumMark}</span>{' '}
                        to apply.
                      </>
                    ) : (
                      <>
                        Enter the final mark you obtained for {opportunity.courseCode}. You need at least{' '}
                        <span className="font-data-mono font-semibold text-on-surface">{opportunity.minimumMark}</span>{' '}
                        to apply.
                      </>
                    )}
                  </p>

                  <div className="max-w-sm">
                    <Input
                      labelText={markVerified ? 'Your Verified Mark for this Course' : 'Your Mark for this Course'}
                      icon="grade"
                      type="number"
                      placeholder="75"
                      value={mark}
                      onChange={handleChange}
                      disabled={markVerified}
                    />
                  </div>

                  <div className="mt-gutter flex gap-2">
                    <Button onClick={() => navigate('/applications')}>Cancel</Button>
                    <Button type="submit" disabled={!canSubmit} loading={isLoading} className="min-w-40">
                      Apply
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default OpportunityDetails;
