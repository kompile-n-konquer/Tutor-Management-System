import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { DAYS, minutesToLabel } from '../../components/slot-grid/SlotGrid';

// Turns an opportunity's slots into compact "Mon 08:00-08:45" badges
const formatSlot = (slot) => `${DAYS[slot.dayOfWeek]} ${minutesToLabel(slot.startMinute)}-${minutesToLabel(slot.endMinute)}`;

const STATUS_BADGES = {
  PENDING: 'bg-trust-blue/10 text-trust-blue',
  APPROVED: 'bg-primary/10 text-primary',
  REJECTED: 'bg-error/10 text-error',
};

const Applications = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [opportunities, setOpportunities] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // Transcript verification state — the parsed marks qualify the student for
  // courses whose minimum mark they meet
  const [transcript, setTranscript] = useState(null);
  const [transcriptError, setTranscriptError] = useState('');
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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

    const loadApplications = async () => {
      const [opportunitiesResponse, mineResponse, transcriptResponse] = await execute(() =>
        Promise.all([
          api.get('/applications', { params: qualifiedOnly ? { qualifiedOnly: 'true' } : {} }),
          api.get('/applications/mine'),
          api.get('/applications/transcript'),
        ])
      );

      if (!opportunitiesResponse || !mineResponse || !transcriptResponse) return;

      if (opportunitiesResponse.status !== 200) {
        setError(opportunitiesResponse?.data?.message || 'Could not load the opportunities. Please refresh the page.');
      } else {
        setOpportunities(opportunitiesResponse.data);
      }
      if (mineResponse.status === 200) {
        setMyApplications(mineResponse.data);
      } else {
        setError(mineResponse?.data?.message || 'Could not load your applications. Please refresh the page.');
      }
      // 404 simply means no transcript has been uploaded yet — that is the
      // normal state for a new student, not an error
      if (transcriptResponse.status === 200) {
        setTranscript(transcriptResponse.data);
      } else {
        setTranscript(null);
      }
      if (opportunitiesResponse.status === 200 && mineResponse.status === 200) {
        setError('');
      }
      setLoaded(true);
    };

    loadApplications();
  }, [currentUser, loading, canApply, execute, reloadKey, qualifiedOnly]);

  if (loading) return null;
  if (!currentUser || !canApply) return null;

  const formatDate = (isoString) => new Date(isoString).toLocaleDateString();

  const handleTranscriptUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setTranscriptError('Choose an academic transcript PDF to upload first.');
      return;
    }

    setUploading(true);
    setTranscriptError('');

    const formData = new FormData();
    formData.append('transcript', file);
    const response = await execute(() => api.post('/applications/transcript', formData));
    setUploading(false);

    if (response && response.status === 201) {
      setTranscript(response.data);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // The verified marks change which opportunities qualify, so reload the list
      setReloadKey((key) => key + 1);
    } else {
      setTranscriptError(response?.data?.message || 'Could not upload the transcript. Please try again.');
    }
  };

  return (
    <AppLayout role="student" title="Applications">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Applications</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Tutoring opportunities that are open for applications. Click one to see the details and apply.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            <Button
              className="min-w-32"
              onClick={() => {
                setError('');
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {/* Availability note — opportunities are already filtered by the student's timetable */}
        <div className="bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm mb-gutter flex flex-wrap items-center gap-gutter">
          <span className="material-symbols-outlined text-primary">schedule</span>
          <p className="font-body-md text-on-surface flex-1 min-w-fit">
            You only see opportunities whose tutoring slots fit your weekly availability.
            <Link to="/timetable/edit" className="text-primary font-semibold underline ml-1">
              Update your timetable
            </Link>{' '}
            to see more.
          </p>
        </div>

        {/* Transcript verification — uploaded marks are parsed and used to work out
            which opportunities the student already qualifies for */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          <div className="flex flex-wrap items-start justify-between gap-gutter">
            <div className="flex items-start gap-gutter">
              <span className="material-symbols-outlined text-primary mt-1">verified</span>
              <div>
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
                  Transcript Verification
                </h2>
                <p className="font-body-md text-on-surface-variant mt-1">
                  Upload your academic transcript and we will read your final marks to work out
                  which tutoring opportunities you already qualify for.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={qualifiedOnly}
                disabled={!transcript}
                onChange={(event) => setQualifiedOnly(event.target.checked)}
                className="accent-primary h-4 w-4"
              />
              <span className="font-body-sm text-on-surface">Only show courses I qualify for</span>
            </label>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            aria-label="Academic transcript PDF"
            onChange={() => setTranscriptError('')}
          />

          {transcriptError && (
            <div className="mt-stack-md">
              <ErrorMessage>{transcriptError}</ErrorMessage>
            </div>
          )}

          {transcript ? (
            <>
              <div className="mt-stack-md flex flex-wrap items-center gap-gutter">
                <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  {transcript.courses.length} course{transcript.courses.length === 1 ? '' : 's'} verified
                </span>
                <span className="font-body-sm text-on-surface-variant font-data-mono">
                  {transcript.fileName}
                </span>
                {transcript.studentNumber && (
                  <span className="font-body-sm text-on-surface-variant">
                    Student ID {transcript.studentNumber}
                  </span>
                )}
                <span className="font-body-sm text-outline">Parsed {formatDate(transcript.parsedAt)}</span>
                <Button
                  className="min-w-32 ml-auto"
                  disabled={uploading}
                  loading={uploading}
                  onClick={handleTranscriptUpload}
                >
                  Replace Transcript
                </Button>
              </div>
              <div className="mt-stack-md flex flex-wrap gap-1">
                {transcript.courses.map((course) => (
                  <span
                    key={course.courseCode}
                    title={course.courseName}
                    className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                  >
                    {course.courseCode} · {course.mark}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-stack-md flex flex-wrap items-center gap-gutter">
              <Button
                className="min-w-48"
                disabled={uploading}
                loading={uploading}
                onClick={handleTranscriptUpload}
              >
                Upload Transcript PDF
              </Button>
              <span className="font-body-sm text-outline">PDF up to 10 MB. In-progress courses without a final mark are ignored.</span>
            </div>
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          {isLoading && !loaded ? (
            <div className="space-y-stack-sm py-stack-sm" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className="animate-pulse flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-md py-stack-sm"
                >
                  <div className="h-4 w-44 rounded bg-surface-container-high" />
                  <div className="h-6 w-28 rounded bg-surface-container-high/60" />
                  <div className="h-4 w-24 rounded bg-surface-container-high/60" />
                  <div className="h-4 w-16 rounded bg-surface-container-high/60" />
                  <div className="h-6 w-24 rounded bg-surface-container-high ml-auto" />
                </div>
              ))}
            </div>
          ) : !error && opportunities.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No opportunities are open for your availability right now. Check back later or update your timetable.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Opportunity</th>
                    <th className="py-stack-sm px-stack-md">Tutoring Slots</th>
                    <th className="py-stack-sm px-stack-md">Added</th>
                    <th className="py-stack-sm px-stack-md">Lecturer</th>
                    <th className="py-stack-sm px-stack-md">Verified Mark</th>
                    <th className="py-stack-sm px-stack-md">Tutors</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                    <th className="py-stack-sm px-stack-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {opportunities.map((opportunity) => (
                    <tr key={opportunity.id}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{opportunity.courseCode}</span>
                        <span className="text-on-surface-variant"> - {opportunity.courseName}</span>
                        <p className="font-body-sm text-outline mt-1">Min mark {opportunity.minimumMark}</p>
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <div className="flex flex-wrap gap-1">
                          {opportunity.slots.map((slot, index) => (
                            <span
                              key={`${slot.dayOfWeek}-${slot.timeSlotId}-${index}`}
                              className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                            >
                              {formatSlot(slot)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(opportunity.createdAt)}
                      </td>
                      <td className="py-stack-sm px-stack-md">{opportunity.lecturer || 'Unknown'}</td>
                      <td className="py-stack-sm px-stack-md">
                        {opportunity.transcriptMark === null || opportunity.transcriptMark === undefined ? (
                          <span className="text-outline" title="Upload your transcript to verify your mark">
                            —
                          </span>
                        ) : opportunity.qualified ? (
                          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold font-data-mono">
                            {opportunity.transcriptMark} · Qualifies
                          </span>
                        ) : (
                          <span className="bg-error/10 text-error px-2 py-1 rounded text-xs font-semibold font-data-mono">
                            {opportunity.transcriptMark} · Below min
                          </span>
                        )}
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-semibold text-on-surface font-data-mono">
                          {opportunity.assignedTutors}/{opportunity.tutorsRequired}
                        </span>
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">
                          Open
                        </span>
                      </td>
                      <td className="py-stack-sm px-stack-md" onClick={(e) => e.stopPropagation()}>
                        <Button className="min-w-32" onClick={() => navigate(`/applications/${opportunity.id}`)}>
                          View & Apply
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* My Applications — everything the student has submitted and its review status */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
            My Applications
          </h2>
          {isLoading && !loaded ? (
            <div className="space-y-stack-sm" aria-hidden="true">
              {[0, 1].map((row) => (
                <div
                  key={row}
                  className="animate-pulse flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-md py-stack-sm"
                >
                  <div className="h-4 w-44 rounded bg-surface-container-high" />
                  <div className="h-4 w-16 rounded bg-surface-container-high/60" />
                  <div className="h-4 w-24 rounded bg-surface-container-high/60" />
                  <div className="h-6 w-20 rounded bg-surface-container-high ml-auto" />
                </div>
              ))}
            </div>
          ) : !error && myApplications.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-md">
              You have not applied for any tutoring opportunities yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Course</th>
                    <th className="py-stack-sm px-stack-md">Your Mark</th>
                    <th className="py-stack-sm px-stack-md">Applied</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {myApplications.map((application) => (
                    <tr key={application.id}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{application.courseCode}</span>
                        <span className="text-on-surface-variant"> - {application.courseName}</span>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono">{application.courseMark}</td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(application.appliedAt)}
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            STATUS_BADGES[application.status] || 'bg-surface-variant text-on-surface-variant'
                          }`}
                        >
                          {application.status}
                        </span>
                      </td>
                    </tr>
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

export default Applications;
