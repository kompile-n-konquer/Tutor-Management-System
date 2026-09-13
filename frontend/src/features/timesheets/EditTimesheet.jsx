import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import { minutesToLabel } from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

// ── Constants ────────────────────────────────────────────────────────────────

// A month is 30-31 days: the same sliding window the backend enforces on submit,
// mirrored here so the tutor sees the cap live while building the timesheet
const WINDOW_DAYS = 31;

const findExcessiveWindow = (rows, maxHours) => {
  const sorted = rows
    .map((row) => ({ time: new Date(row.workDate).getTime(), hours: Number(row.duration) }))
    .sort((a, b) => a.time - b.time);

  for (let i = 0; i < sorted.length; i += 1) {
    const windowEnd = sorted[i].time + (WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000;
    let hours = 0;
    let last = sorted[i];
    for (let j = i; j < sorted.length && sorted[j].time <= windowEnd; j += 1) {
      hours += sorted[j].hours;
      last = sorted[j];
    }
    if (hours > maxHours) {
      return { hours, start: new Date(sorted[i].time), end: new Date(last.time) };
    }
  }
  return null;
};

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

// Timesheet entries are created by claiming events: the payload carries just the
// eventId and the backend re-derives every field from the event data so the two
// can never drift. Rows without an eventId only survive on older drafts — the
// backend rejects them so the tutor removes them before saving.
const toPayload = (entry) =>
  entry.eventId
    ? { eventId: entry.eventId }
    : {
        courseId: entry.courseId,
        supervisorId: entry.supervisorId,
        workDate: entry.workDate,
        duration: entry.duration,
        description: entry.description,
      };

// ── Component ────────────────────────────────────────────────────────────────

const EditTimesheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { execute, isLoading, error, setError } = useAsync();

  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState([]);
  const [claimableEvents, setClaimableEvents] = useState([]);
  const [ownClaimedEvents, setOwnClaimedEvents] = useState([]);
  const [maxClaimableHours, setMaxClaimableHours] = useState(null);
  const [referenceLoaded, setReferenceLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef(null);

  const saveTimer = useRef(null);
  const entriesRef = useRef(entries);
  const timesheetIdRef = useRef(null);

  // The debounced save reads the latest entries through this ref — keep it in
  // sync after commit, never during render
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const role = currentUser?.role?.toLowerCase();
  const isTutor = role === 'tutor';
  const isEditable = !timesheet || timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';
  const displayName = timesheet?.name || 'Untitled';

  // ── Load reference data ──────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const loadReferenceData = async () => {
      const [settingsRes, eventsRes] = await execute(() =>
        Promise.all([
          api.get('/settings'),
          // Only tutors can claim events
          isTutor ? api.get('/events/claimable') : Promise.resolve(null),
        ])
      );
      if (settingsRes?.status === 200) {
        setMaxClaimableHours(settingsRes.data.tutorMonthlyClaimableHours);
      }
      if (eventsRes?.status === 200) {
        setClaimableEvents(eventsRes.data);
      }
      setReferenceLoaded(true);
    };

    loadReferenceData();
  }, [currentUser, authLoading, navigate, execute, isTutor]);

  // ── Load existing timesheet ──────────────────────────────────────────────

  useEffect(() => {
    if (authLoading || !currentUser) return;

    const loadTimesheet = async () => {
      if (!id || id === 'new') return;
      const res = await execute(() => api.get(`/timesheets/${id}`));
      if (res?.status === 200) {
        setTimesheet(res.data);
        timesheetIdRef.current = res.data.id;
        if (res.data.entries.length > 0) {
          setEntries(
            res.data.entries.map((e) => ({
              eventId: e.eventId ?? null,
              courseId: e.courseId,
              courseCode: e.courseCode,
              courseName: e.courseName,
              supervisorId: e.supervisorId,
              supervisorName: e.supervisorName,
              workDate: e.workDate ? e.workDate.split('T')[0] : new Date().toISOString().split('T')[0],
              duration: e.duration,
              description: e.description,
            }))
          );
          // The claimable list excludes events this timesheet has already claimed,
          // so remember them here — removing the entry makes the event selectable
          // again in the picker without another fetch
          setOwnClaimedEvents(
            res.data.entries
              .filter((e) => e.eventId)
              .map((e) => ({
                id: e.eventId,
                courseId: e.courseId,
                courseCode: e.courseCode,
                courseName: e.courseName,
                date: e.workDate,
                description: e.description,
                supervisorId: e.supervisorId,
                lecturer: e.supervisorName,
                times: [],
                duration: e.duration,
              }))
          );
        } else {
          setEntries([]);
          setOwnClaimedEvents([]);
        }
      }
    };

    loadTimesheet();
  }, [currentUser, authLoading, id, execute]);

  // ── Inline name editing ──────────────────────────────────────────────────

  const startEditName = () => {
    if (!isEditable) return;
    setNameValue(timesheet?.name || '');
    setEditingName(true);
  };

  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const commitName = async () => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (!trimmed || !timesheetIdRef.current || trimmed === timesheet?.name) return;
    try {
      const res = await api.put(`/timesheets/${timesheetIdRef.current}`, {
        entries: entriesRef.current.map(toPayload),
        name: trimmed,
      });
      if (res.status === 200) {
        setTimesheet(res.data);
        setLastSaved(new Date());
      }
    } catch {
      // silently revert — the heading still shows the old name
    }
  };

  // ── Auto-save (debounced, only for editable timesheets) ──────────────────

  const doSave = useCallback(async () => {
    const tsId = timesheetIdRef.current;
    if (!tsId || !isEditable) return;

    const validEntries = entriesRef.current.map(toPayload);

    setSaving(true);
    const res = await api.put(`/timesheets/${tsId}`, { entries: validEntries });
    if (res.status === 200) {
      setTimesheet(res.data);
      setLastSaved(new Date());
    } else {
      setError(res.data?.message || 'Could not save draft');
    }
    setSaving(false);
  }, [isEditable, setError]);

  const scheduleSave = useCallback(() => {
    if (!isEditable) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(doSave, 1500);
  }, [doSave, isEditable]);

  // ── Create timesheet if needed ───────────────────────────────────────────

  const ensureTimesheetId = useCallback(async () => {
    if (timesheetIdRef.current) return timesheetIdRef.current;
    // No name sent — the backend assigns the unique "Untitled-<id>" default
    const res = await api.post('/timesheets');
    if (res.status === 201) {
      timesheetIdRef.current = res.data.id;
      setTimesheet(res.data);
      navigate(`/timesheets/${res.data.id}`, { replace: true });
      return res.data.id;
    }
    return null;
  }, [navigate]);

  useEffect(() => {
    if (authLoading || !currentUser) return;
    if ((!id || id === 'new') && !timesheetIdRef.current) {
      ensureTimesheetId();
    }
  }, [authLoading, currentUser, id, ensureTimesheetId]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Entry handlers ───────────────────────────────────────────────────────

  // Entries can only be added by claiming an event — removing one is the only
  // manual edit left
  const removeEntry = (index) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
    scheduleSave();
  };

  // Claiming an event appends a fully populated entry — course, date,
  // description, supervisor and round-up duration all come from the event data,
  // so the entry accumulates in the list the moment it is selected
  const addEventEntry = (event) => {
    setEntries((prev) => [
      ...prev,
      {
        eventId: event.id,
        courseId: event.courseId,
        courseCode: event.courseCode,
        courseName: event.courseName,
        supervisorId: event.supervisorId,
        supervisorName: event.lecturer,
        workDate: event.date.split('T')[0],
        duration: event.duration,
        description: event.description,
      },
    ]);
    scheduleSave();
  };

  // ── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Save first
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await ensureTimesheetId();

    const validEntries = entries.map(toPayload);
    if (validEntries.length === 0) {
      setError('Claim at least one event before submitting');
      return;
    }

    // Save entries first
    const tsId = timesheetIdRef.current;
    const saveRes = await api.put(`/timesheets/${tsId}`, { entries: validEntries });
    if (saveRes.status !== 200) {
      setError(saveRes.data?.message || 'Could not save entries');
      return;
    }

    // Then submit
    const submitRes = await api.post(`/timesheets/${tsId}/submit`);
    if (submitRes.status === 200) {
      setSubmitSuccess(true);
      setTimesheet(submitRes.data);
      setTimeout(() => navigate('/timesheets'), 1500);
    } else {
      setError(submitRes.data?.message || 'Could not submit timesheet');
    }
  };

  if (authLoading) return null;
  if (!currentUser) return null;

  // Non-editable timesheets are displayed on the read-only details page — redirect
  // before rendering so the edit UI is never shown for submitted/approved timesheets
  if (timesheet && !isEditable) {
    navigate(`/timesheets/${id}/details`, { replace: true });
    return null;
  }

  // Every duration is a whole number of hours under the round-up rule, so the
  // running total is a whole number too
  const totalHours = entries.reduce((sum, e) => sum + Number(e.duration || 0), 0);

  // Live cap check: a timesheet above the maximum claimable hours in any 31-day
  // window cannot be submitted — the backend enforces the same rule
  const excessive =
    maxClaimableHours !== null && entries.length > 0
      ? findExcessiveWindow(entries, maxClaimableHours)
      : null;

  const claimedEventIds = new Set(entries.filter((e) => e.eventId).map((e) => e.eventId));

  // Picker rows: the fetched claimable events plus this timesheet's own claims
  // (so a removed entry can be re-added straight away)
  const knownEventIds = new Set(claimableEvents.map((event) => event.id));
  const pickerEvents = [
    ...claimableEvents,
    ...ownClaimedEvents.filter((event) => !knownEventIds.has(event.id)),
  ];

  return (
    <AppLayout role={role} title="Timesheet">
      <div className="p-gutter md:p-margin-page space-y-gutter">
        {/* Header */}
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2
              className={`font-display text-display text-primary group cursor-pointer inline-flex items-center gap-2 ${!isEditable ? 'cursor-default' : ''}`}
              onClick={startEditName}
              title={isEditable ? 'Click to rename' : ''}
            >
              {editingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="font-display text-display text-primary bg-transparent border-b-2 border-primary outline-none w-full min-w-[200px]"
                  maxLength={100}
                />
              ) : (
                <>
                  {displayName}
                  {isEditable && (
                    <span className="material-symbols-outlined text-on-surface-variant text-base opacity-0 group-hover:opacity-100 transition-opacity">
                      edit
                    </span>
                  )}
                </>
              )}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Claim past events below to log the hours you have worked
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate('/timesheets')}>
              Back to Timesheets
            </Button>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {submitSuccess && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-stack-md py-stack-sm text-primary font-semibold">
            Timesheet submitted successfully! Redirecting...
          </div>
        )}

        {timesheet?.rejectionReason && (
          <div className="bg-error/10 border border-error/30 rounded-xl px-stack-md py-stack-sm">
            <p className="text-error font-semibold text-sm">
              Rejection reason: {timesheet.rejectionReason}
            </p>
          </div>
        )}

        {/* Event picker — past events on the tutor's allocated courses */}
        {isTutor && isEditable && (
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <div className="mb-stack-md">
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                Claim Past Events
              </h3>
              <p className="font-body-sm text-on-surface-variant mt-1">
                Timesheet entries come from events — select a past event on one of your allocated
                courses and its entry is filled in from the event data.
              </p>
            </div>
            {isLoading && !referenceLoaded ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                Loading events...
              </p>
            ) : pickerEvents.length === 0 ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                No claimable events right now.
              </p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                      <th className="py-stack-sm px-stack-md">Course</th>
                      <th className="py-stack-sm px-stack-md">Date</th>
                      <th className="py-stack-sm px-stack-md">Time</th>
                      <th className="py-stack-sm px-stack-md">Description</th>
                      <th className="py-stack-sm px-stack-md">Lecturer</th>
                      <th className="py-stack-sm px-stack-md">Hours</th>
                      <th className="py-stack-sm px-stack-md"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-variant font-body-md">
                    {pickerEvents.map((event) => {
                      const claimed = claimedEventIds.has(event.id);
                      return (
                        <tr key={event.id}>
                          <td className="py-stack-sm px-stack-md">
                            <span className="font-bold text-primary">{event.courseCode}</span>
                            <span className="text-on-surface-variant"> - {event.courseName}</span>
                          </td>
                          <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                            {formatEventDay(event.date)}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {event.times && event.times.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {event.times.map((time, index) => (
                                  <span
                                    key={`${event.id}-${index}`}
                                    className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                                  >
                                    {minutesToLabel(time.startMinute)}-{minutesToLabel(time.endMinute)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-outline text-sm">—</span>
                            )}
                          </td>
                          <td className="py-stack-sm px-stack-md capitalize">{event.description}</td>
                          <td className="py-stack-sm px-stack-md">{event.lecturer || 'Unknown'}</td>
                          <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                            {event.duration} {event.duration === 1 ? 'hr' : 'hrs'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {claimed ? (
                              <span className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">check</span>
                                Added
                              </span>
                            ) : (
                              <Button className="min-w-24 max-h-8" onClick={() => addEventEntry(event)}>
                                Add
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Entries */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md space-y-gutter">
          <div className="flex flex-wrap items-center gap-stack-md font-body-md text-on-surface-variant">
            <span className="font-data-mono font-semibold text-on-surface">
              Total hours: {totalHours} hrs
            </span>
            {maxClaimableHours !== null && (
              <span className="text-xs">max {maxClaimableHours} hrs per 31 days</span>
            )}
            <span>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
            {saving && <span className="text-primary text-xs">Saving...</span>}
            {lastSaved && !saving && (
              <span className="text-xs">Saved {lastSaved.toLocaleTimeString()}</span>
            )}
          </div>

          {excessive && (
            <div className="bg-error/10 border border-error/30 rounded-lg px-stack-md py-stack-sm">
              <p className="text-error font-semibold text-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] mt-0.5">warning</span>
                <span>
                  {excessive.hours} hours fall between {formatEventDay(excessive.start)} and{' '}
                  {formatEventDay(excessive.end)} — above the maximum of{' '}
                  {maxClaimableHours} claimable hours per 31 days. Remove some entries before
                  submitting.
                </span>
              </p>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              {isTutor && isEditable
                ? 'No entries yet — claim a past event above to add one.'
                : 'This timesheet has no entries.'}
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
                    <th className="py-stack-sm px-stack-md">Supervisor</th>
                    {isEditable && <th className="py-stack-sm px-stack-md"></th>}
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
                      <td className="py-stack-sm px-stack-md">
                        {entry.supervisorName || 'Unknown'}
                      </td>
                      {isEditable && (
                        <td className="py-stack-sm px-stack-md">
                          <button
                            onClick={() => removeEntry(index)}
                            className="cursor-pointer text-error hover:text-error/80 transition-colors p-2"
                            title="Remove entry"
                          >
                            <span className="material-symbols-outlined text-lg">close</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Actions */}
        {isEditable && (
          <div className="mt-gutter flex gap-2">
            <Button onClick={() => navigate('/timesheets')}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={entries.length === 0 || excessive !== null}
              loading={isLoading}
              className="min-w-40"
            >
              Submit for Approval
            </Button>
          </div>
        )}

      </div>
    </AppLayout>
  );
};

export default EditTimesheet;
