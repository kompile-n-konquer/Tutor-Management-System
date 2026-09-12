import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

// ── Searchable dropdown ──────────────────────────────────────────────────────

const SearchSelect = ({ options, value, onChange, placeholder, label, displayFn, displayOptionFn, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter((opt) => {
    const text = displayOptionFn ? displayOptionFn(opt) : (displayFn ? displayFn(opt) : opt.name || opt.label || String(opt));
    return text.toLowerCase().includes(search.toLowerCase());
  });

  const selectedLabel = value
    ? displayFn
      ? displayFn(options.find((o) => o.id === value) || value)
      : String(value)
    : '';

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full text-left rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-colors h-11 shadow-sm flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={selectedLabel ? 'text-on-surface' : 'text-outline'}>
          {selectedLabel || placeholder || 'Select...'}
        </span>
        <span className="material-symbols-outlined text-outline text-lg">expand_more</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-surface-variant">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full rounded border-outline-variant bg-surface py-1.5 px-3 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary text-sm"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-on-surface-variant text-center">No matches</p>
            ) : (
              filtered.map((opt) => {
                const optLabel = displayOptionFn ? displayOptionFn(opt) : (displayFn ? displayFn(opt) : opt.name || opt.label || String(opt));
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setSearch('');
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm font-body-md transition-colors ${
                      isSelected
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'text-on-surface hover:bg-surface-variant'
                    }`}
                  >
                    {optLabel}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

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

  const saveTimer = useRef(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const timesheetIdRef = useRef(null);

  const isEditable = !timesheet || timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';

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
            <h2 className="font-display text-display text-primary">Edit Timesheet</h2>
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
                    className="text-error hover:text-error/80 transition-colors p-2 mb-0.5"
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
          <div className="flex gap-2 justify-end">
            <Button
              className="min-w-40 bg-trust-blue text-white"
              onClick={handleSubmit}
              disabled={entries.filter((e) => e.courseId && e.supervisorId && e.workDate && e.duration && e.description).length === 0}
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
