import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

// Event and entry dates live at UTC midnight — format them in UTC so the
// displayed day always matches the stored one
const formatEventDay = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const STATUS_MESSAGES = {
  SUBMITTED: 'This timesheet has been submitted and is awaiting supervisor review.',
  APPROVED: 'This timesheet has been approved.',
};

// Map backend entries to the local shape used by the table
const parseEntries = (raw) =>
  (raw || []).map((e) => ({
    id: e.id,
    courseId: e.courseId,
    courseCode: e.courseCode,
    courseName: e.courseName,
    supervisorId: e.supervisorId,
    supervisorName: e.supervisorName,
    workDate: e.workDate
      ? e.workDate.split('T')[0]
      : new Date().toISOString().split('T')[0],
    duration: e.duration,
    description: e.description,
    status: e.status,
    // Event-register attendance for claimed entries: true/false, null for
    // entries that are not event claims
    attended: e.attended ?? null,
  }));

const TimesheetDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { execute, error } = useAsync();

  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState([]);
  const [rejectionModal, setRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [localError, setLocalError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const role = currentUser?.role?.toLowerCase();
  const isLecturer = role === 'lecturer' || role === 'organiser' || role === 'admin';
  const isSubmitted = timesheet?.status === 'SUBMITTED';
  const isApproved = timesheet?.status === 'APPROVED';
  const displayName = timesheet?.name || 'Untitled';

  // ── Load timesheet ───────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading || !currentUser) return;

    const loadTimesheet = async () => {
      if (!id) return;
      const tsRes = await execute(() => api.get(`/timesheets/${id}`));
      if (tsRes?.status === 200) {
        setTimesheet(tsRes.data);
        // Lecturers only see the entries they supervise — a timesheet may span
        // multiple courses with different lecturers
        const raw = tsRes.data.entries || [];
        const scoped = isLecturer
          ? raw.filter((e) => e.supervisorId === currentUser.id)
          : raw;
        setEntries(parseEntries(scoped));
        setLoadError('');
      } else {
        setLoadError(tsRes?.data?.message || 'Could not load the timesheet. Please try again.');
      }
    };

    loadTimesheet();
  }, [currentUser, authLoading, id, execute, isLecturer, reloadKey]);

  // ── Redirect unauthenticated users ────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) navigate('/login');
  }, [currentUser, authLoading, navigate]);

  // ── Non-editable timesheets should not end up on the edit page — but if ──
  // someone navigates here for a DRAFT/REJECTED timesheet, send them to edit
  useEffect(() => {
    if (!timesheet) return;
    if (timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED') {
      navigate(`/timesheets/${id}`, { replace: true });
    }
  }, [timesheet, id, navigate]);

  if (authLoading) return null;
  if (!currentUser) return null;

  // The load failed — surface it with a retry instead of leaving the skeleton up forever.
  if (!timesheet && loadError) {
    return (
      <AppLayout role={role} title="Timesheet">
        <div className="p-gutter md:p-margin-page space-y-gutter">
          <ErrorMessage>{loadError}</ErrorMessage>
          <Button
            className="min-w-32"
            onClick={() => {
              setLoadError('');
              setReloadKey((key) => key + 1);
            }}
          >
            Try again
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Shaped placeholder while the timesheet loads so the page never flashes blank.
  if (!timesheet) {
    return (
      <AppLayout role={role} title="Timesheet">
        <div className="p-gutter md:p-margin-page space-y-gutter" aria-hidden="true">
          <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
            <div className="space-y-stack-sm">
              <div className="animate-pulse h-12 w-64 rounded bg-surface-container-high" />
              <div className="animate-pulse h-4 w-80 max-w-full rounded bg-surface-container-high/60" />
            </div>
            <div className="animate-pulse h-9 w-36 rounded bg-surface-container-high" />
          </div>
          <div className="animate-pulse bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md space-y-stack-sm">
            <div className="h-4 w-40 rounded bg-surface-container-high" />
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-12 rounded bg-surface-container-high/60" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  const totalHours = entries.reduce((sum, e) => sum + Number(e.duration || 0), 0);
  const statusMessage = STATUS_MESSAGES[timesheet.status] || '';

  const pendingEntryIds = entries.filter(
    (e) => e.status !== 'APPROVED' && e.supervisorId === currentUser.id
  );
  // Claimed events the tutor was not marked present for block approval — the
  // lecturer must reject the timesheet instead
  const missingRegister = pendingEntryIds.filter((e) => e.attended === false);
  const canApprove =
    isSubmitted && pendingEntryIds.length > 0 && missingRegister.length === 0;

  // Approve all of this lecturer's pending entries in one action — the backend
  // promotes the timesheet to APPROVED once every entry (across all lecturers)
  // has been approved
  const handleApproveTimesheet = async () => {
    const ids = pendingEntryIds.map((e) => e.id);
    const results = await Promise.all(
      ids.map((entryId) => execute(() => api.put(`/timesheets/${id}/entries/${entryId}/approve`)))
    );
    if (results.every((r) => r?.status === 200)) {
      const tsRes = await execute(() => api.get(`/timesheets/${id}`));
      if (tsRes?.status === 200) {
        setTimesheet(tsRes.data);
        const raw = tsRes.data.entries || [];
        const scoped = isLecturer
          ? raw.filter((e) => e.supervisorId === currentUser.id)
          : raw;
        setEntries(parseEntries(scoped));
        if (tsRes.data.status === 'APPROVED') {
          setTimeout(() => navigate('/timesheets'), 1500);
        }
      }
    }
  };

  const handleRejectTimesheet = async () => {
    if (!rejectionReason.trim()) {
      setLocalError('A rejection reason is required');
      return;
    }
    const res = await execute(() => api.put(`/timesheets/${id}/reject`, { reason: rejectionReason }));
    if (res?.status === 200) {
      setRejectionModal(false);
      setRejectionReason('');
      navigate('/timesheets');
    } else {
      setLocalError(res?.data?.message || 'Could not reject timesheet');
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    setLocalError('');
    try {
      const res = await api.get(`/timesheets/${id}/export`, { responseType: 'blob' });
      if (res.status === 200) {
        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const link = document.createElement('a');
        link.href = url;
        // Use the timesheet name for the downloaded file
        const safeName = (timesheet?.name || 'timesheet').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
        link.setAttribute('download', `${safeName}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        // Blob response — try to parse the error message
        const text = await res.data.text();
        try {
          const json = JSON.parse(text);
          setLocalError(json.message || 'Could not export PDF');
        } catch {
          setLocalError('Could not export PDF');
        }
      }
    } catch {
      setLocalError('Network error while exporting PDF');
    }
    setExporting(false);
  };

  return (
    <AppLayout role={role} title="Timesheet">
      <div className="p-gutter md:p-margin-page space-y-gutter">
        {/* Header */}
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">{displayName}</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {isLecturer && timesheet.tutorName
                ? `${timesheet.tutorName} — ${timesheet.tutorEmail || ''}`
                : 'Claim past events below to log the hours you have worked'}
            </p>
          </div>
          <div className="flex gap-2">
            {isApproved && (
              <Button
                className="min-w-36 max-h-8"
                onClick={handleExportPdf}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export PDF'}
              </Button>
            )}
            <Button className="min-w-40" onClick={() => navigate('/timesheets')}>
              Back to Timesheets
            </Button>
          </div>
        </div>

        {(error || localError) && <ErrorMessage>{error || localError}</ErrorMessage>}

        {timesheet.rejectionReason && (
          <div className="bg-error/10 border border-error/30 rounded-xl px-stack-md py-stack-sm">
            <p className="text-error font-semibold text-sm">
              Rejection reason: {timesheet.rejectionReason}
            </p>
          </div>
        )}

        {isLecturer && isSubmitted && missingRegister.length > 0 && (
          <div className="bg-error/10 border border-error/30 rounded-xl px-stack-md py-stack-sm flex items-start gap-stack-sm">
            <span className="material-symbols-outlined text-[18px] mt-0.5 text-error">warning</span>
            <p className="text-error font-body-sm">
              Approval is disabled: {timesheet.tutorName || 'the tutor'} was not marked present on
              the event register for{' '}
              {missingRegister
                .map((e) => `${e.courseCode} on ${formatEventDay(e.workDate)}`)
                .join(', ')}
              . Reject the timesheet to let the tutor correct it.
            </p>
          </div>
        )}

        {/* Entries */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md space-y-gutter">
          <div className="flex flex-wrap items-center justify-between">
            <div className="flex flex-wrap items-center gap-stack-md font-body-md text-on-surface-variant">
              <span className="font-data-mono font-semibold text-on-surface">
                Total hours: {totalHours} hrs
              </span>
              <span>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            {isLecturer && isSubmitted && (
              <div className="flex">
                <Button
                  className="min-w-32 max-h-8 mr-3 bg-primary text-on-primary"
                  onClick={handleApproveTimesheet}
                  disabled={!canApprove}
                >
                  Approve
                </Button>
                <Button
                  className="min-w-32 max-h-8 border-error text-error hover:bg-error/10"
                  onClick={() => {
                    // Suggest a reason when register mismatches are the blocker
                    const suggested =
                      missingRegister.length > 0
                        ? `Register mismatch: ${timesheet.tutorName || 'the tutor'} was not marked present on the register for ${missingRegister
                            .map((e) => `${e.courseCode} on ${formatEventDay(e.workDate)}`)
                            .join(', ')}.`
                        : '';
                    setRejectionModal(true);
                    setRejectionReason(suggested);
                    setLocalError('');
                  }}
                >
                  Reject
                </Button>
              </div>
            )}
          </div>

          {entries.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              This timesheet has no entries.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Course</th>
                    <th className="py-stack-sm px-stack-md">Date</th>
                    <th className="py-stack-sm px-stack-md">Description</th>
                    <th className="py-stack-sm px-stack-md">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {entries.map((entry, index) => (
                    <tr key={entry.eventId ?? `entry-${index}`}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{entry.courseCode}</span>
                        <span className="text-on-surface-variant"> - {entry.courseName}</span>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatEventDay(entry.workDate)}
                      </td>
                      <td className="py-stack-sm px-stack-md capitalize">{entry.description}</td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {Number(entry.duration)} {Number(entry.duration) === 1 ? 'hr' : 'hrs'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {statusMessage && !isLecturer && (
          <div className="text-center py-stack-md">
            <p className="font-body-md text-on-surface-variant font-semibold">{statusMessage}</p>
          </div>
        )}

        {/* Rejection reason modal */}
        {rejectionModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-lg p-stack-md max-w-md w-full space-y-stack-md">
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                Reject Timesheet
              </h3>
              <p className="font-body-md text-on-surface-variant">
                Provide a reason for rejection. The tutor will be able to edit and resubmit.
              </p>
              {localError && <ErrorMessage>{localError}</ErrorMessage>}
              <textarea
                value={rejectionReason}
                onChange={(e) => { setRejectionReason(e.target.value); setLocalError(''); }}
                placeholder="Reason for rejection..."
                rows={3}
                className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                
                <button
                  onClick={() => setRejectionModal(false)}
                  className="cursor-pointer px-4 py-2 rounded-lg text-on-surface-variant hover:bg-surface-variant text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectTimesheet}
                  className="cursor-pointer bg-error text-on-error px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default TimesheetDetails;
