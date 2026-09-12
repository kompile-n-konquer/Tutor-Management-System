import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SearchSelect from '../../components/search-select/SearchSelect';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

// ── Constants ────────────────────────────────────────────────────────────────

const DESCRIPTIONS = [
  { id: 'tutoring', name: 'Tutoring' },
  { id: 'marking', name: 'Marking' },
  { id: 'invigilation', name: 'Invigilation' },
  { id: 'admin', name: 'Admin' },
];

const DURATIONS = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `${i + 1} hour${i > 0 ? 's' : ''}`,
}));

// ── Empty entry template ─────────────────────────────────────────────────────

const emptyEntry = () => ({
  courseId: null,
  courseCode: null,
  courseName: null,
  supervisorId: null,
  workDate: new Date().toISOString().split('T')[0],
  duration: null,
  description: null,
});

// ── Component ────────────────────────────────────────────────────────────────

const EditTimesheet = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { execute, isLoading, error, setError } = useAsync();

  const [timesheet, setTimesheet] = useState(null);
  const [entries, setEntries] = useState([emptyEntry()]);
  const [courses, setCourses] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = useRef(null);

  const saveTimer = useRef(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const timesheetIdRef = useRef(null);

  const isEditable = !timesheet || timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';
  const displayName = timesheet?.name || 'New Timesheet';

  // ── Load reference data ──────────────────────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    const [coursesRes, supervisorsRes] = await execute(() =>
      Promise.all([api.get('/courses'), api.get('/timesheets/supervisors')])
    );
    if (coursesRes?.status === 200) {
      setCourses(
        coursesRes.data.map((c) => ({
          id: c.id,
          name: c.courseName,
          code: c.courseCode,
        }))
      );
    }
    if (supervisorsRes?.status === 200) {
      setSupervisors(
        supervisorsRes.data.map((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
        }))
      );
    }
  }, [execute]);

  // ── Load existing timesheet ──────────────────────────────────────────────

  const loadTimesheet = useCallback(async () => {
    if (!id || id === 'new') return;
    const res = await execute(() => api.get(`/timesheets/${id}`));
    if (res?.status === 200) {
      setTimesheet(res.data);
      timesheetIdRef.current = res.data.id;
      if (res.data.entries.length > 0) {
        console.log(res.data.entries);
        setEntries(
          res.data.entries.map((e) => ({
            courseId: e.courseId,
            courseCode: e.courseCode,
            courseName: e.courseName,
            supervisorId: e.supervisorId,
            workDate: e.workDate ? e.workDate.split('T')[0] : new Date().toISOString().split('T')[0],
            duration: e.duration,
            description: e.description,
          }))
        );
      } else {
        setEntries([emptyEntry()]);
      }
    }
  }, [id, execute]);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      navigate('/login');
      return;
    }
    loadReferenceData();
  }, [currentUser, authLoading, navigate, loadReferenceData]);

  useEffect(() => {
    if (authLoading || !currentUser) return;
    loadTimesheet();
  }, [currentUser, authLoading, loadTimesheet]);

  useEffect(() => {
    if (loaded) return;
    if (courses.length > 0 && supervisors.length > 0) {
      setLoaded(true);
    }
  }, [courses, supervisors, loaded]);

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
        entries: entriesRef.current.filter(
          (e) => e.courseId && e.supervisorId && e.workDate && e.duration && e.description
        ),
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

    const validEntries = entriesRef.current.filter(
      (e) => e.courseId && e.supervisorId && e.workDate && e.duration && e.description
    );
    if (validEntries.length === 0) return;

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
    const res = await api.post('/timesheets', { name: 'New Timesheet' });
    if (res.status === 201) {
      timesheetIdRef.current = res.data.id;
      setTimesheet(res.data);
      navigate(`/timesheets/${res.data.id}`, { replace: true });
      return res.data.id;
    }
    return null;
  }, [navigate]);

  useEffect(() => {
    if (loaded && !timesheetIdRef.current && (!id || id === 'new')) {
      ensureTimesheetId();
    }
  }, [loaded, id, ensureTimesheetId]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  // ── Entry handlers ───────────────────────────────────────────────────────

  const updateEntry = (index, field, value) => {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    scheduleSave();
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, emptyEntry()]);
  };

  const removeEntry = (index) => {
    setEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
    scheduleSave();
  };

  // ── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Save first
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await ensureTimesheetId();

    const validEntries = entries.filter(
      (e) => e.courseId && e.supervisorId && e.workDate && e.duration && e.description
    );
    if (validEntries.length === 0) {
      setError('Add at least one complete entry before submitting');
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

  const role = currentUser?.role?.toLowerCase();
  const totalHours = entries
    .filter((e) => e.duration)
    .reduce((sum, e) => sum + Number(e.duration), 0);

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
              Fill your timesheet below to log hours that you have worked
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

        {/* Entries */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md space-y-gutter">
          <div className="flex flex-wrap items-center justify-between gap-gutter">
            <div className="flex items-center gap-stack-md font-body-md text-on-surface-variant">
              <span className="font-data-mono font-semibold text-on-surface">Total hours: {totalHours.toFixed(1)} hrs</span>
              <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
              {saving && <span className="text-primary text-xs">Saving...</span>}
              {lastSaved && !saving && (
                <span className="text-xs">Saved {lastSaved.toLocaleTimeString()}</span>
              )}
            </div>
            <div>
              {isEditable && (
                <Button className="min-w-24" onClick={addEntry}>
                  Add Entry
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-stack-sm">
            {entries.map((entry, index) => (
              <div
                key={index}
                className="flex flex-wrap items-end gap-stack-sm p-stack-sm border border-surface-variant rounded-lg bg-surface-container-low"
              >
                <div className="min-w-[140px]">
                  <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Date</label>
                  <input
                    type="date"
                    value={entry.workDate}
                    onChange={(e) => updateEntry(index, 'workDate', e.target.value)}
                    disabled={!isEditable}
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 px-3 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-colors h-11 shadow-sm disabled:opacity-50"
                  />
                </div>
                <div className="min-w-[110px]">
                  <SearchSelect
                    label="Duration"
                    options={DURATIONS}
                    value={entry.duration}
                    onChange={(val) => updateEntry(index, 'duration', val)}
                    placeholder="Hours"
                    disabled={!isEditable}
                  />
                </div>
                <div className="min-w-[180px] flex-1">
                  <SearchSelect
                    label="Course"
                    options={courses}
                    value={entry.courseCode ? `${entry.courseCode} - ${entry.courseName}` : ''}
                    onChange={(val) => updateEntry(index, 'courseId', val)}
                    placeholder="Select a course..."
                    displayOptionFn={(o) => `${o.code} - ${o.name}`}
                    disabled={!isEditable}
                  />
                </div>
                <div className="min-w-[160px] flex-1">
                  <SearchSelect
                    label="Supervisor"
                    options={supervisors}
                    value={entry.supervisorId}
                    onChange={(val) => updateEntry(index, 'supervisorId', val)}
                    placeholder="Select a supervisor..."
                    displayOptionFn={(o) => `${o.name} (${o.email})`}
                    disabled={!isEditable}
                  />
                </div>      
                <div className="min-w-[130px]">
                  <SearchSelect
                    label="Description"
                    options={DESCRIPTIONS}
                    value={entry.description}
                    onChange={(val) => updateEntry(index, 'description', val)}
                    placeholder="Task type"
                    disabled={!isEditable}
                  />
                </div>
                {entries.length > 1 && isEditable && (
                  <button
                    onClick={() => removeEntry(index)}
                    className="cursor-pointer text-error hover:text-error/80 transition-colors p-2 mb-0.5"
                    title="Remove entry"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {isEditable && (
          <div className="mt-gutter flex gap-2">
            <Button onClick={() => navigate('/timesheets')}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={entries.filter((e) => e.courseId && e.supervisorId && e.workDate && e.duration && e.description).length === 0}
              loading={isLoading}
              className="min-w-40"
            >
              Submit for Approval
            </Button>
          </div>
        )}

        {!isEditable && (
          <div className="text-center py-stack-md">
            <p className="font-body-md text-on-surface-variant font-semibold">
              This timesheet has been submitted and is awaiting supervisor review.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default EditTimesheet;
