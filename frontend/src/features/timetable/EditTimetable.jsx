import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import TimetableUploadCard from '../../components/timetable-upload/TimetableUploadCard';
import { formatSessionDate, formatSessionTimeRange } from '../../utils/formatSession';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts 480 -> "08:00"
const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const EditTimetable = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, role, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [grid, setGrid] = useState({}); // { [slotId]: { [dayIndex]: 'available' | 'locked' | 'empty' } }
  const [savedGrid, setSavedGrid] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [appliedInfo, setAppliedInfo] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    if (loading || !currentUser) return;

    const loadAvailability = async () => {
      const response = await execute(() => api.get('/availability'));
      if (!response || response.status !== 200) {
        setLoadError('Could not load your availability. Please try again.');
        return;
      }
      setLoadError('');

      const slots = response.data.timeSlots;
      const entries = response.data.availability;
      const lockedEntries = response.data.lockedSlots || [];

      const newGrid = {};
      slots.forEach((slot) => {
        newGrid[slot.id] = { 0: 'empty', 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' };
      });
      entries.forEach((entry) => {
        if (newGrid[entry.timeSlotId]) {
          newGrid[entry.timeSlotId][entry.dayOfWeek] = 'available';
        }
      });
      // Slots locked by submitted applications stay available but cannot be toggled off
      lockedEntries.forEach((entry) => {
        if (newGrid[entry.timeSlotId]) {
          newGrid[entry.timeSlotId][entry.dayOfWeek] = 'locked';
        }
      });

      setTimeSlots(slots);
      setGrid(newGrid);
      setSavedGrid(JSON.parse(JSON.stringify(newGrid)));
    };

    loadAvailability();
  }, [currentUser, loading, execute, reloadKey]);

  // Fetch upcoming sessions for tutors (the dashboard's source of truth).
  const fetchSessions = useCallback(async () => {
    if (role !== 'tutor') return;
    try {
      const response = await api.get('/sessions/mine');
      if (response?.status === 200) {
        // Only upcoming sessions (today or later).
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const upcoming = (response.data?.sessions ?? []).filter(
          (s) => new Date(s.date) >= now,
        );
        setSessions(upcoming);
      }
    } catch {
      // A failed session lookup must never break the availability editor.
    }
  }, [role]);

  useEffect(() => {
    if (!loading && currentUser) {
      (async () => {
        await fetchSessions();
      })();
    }
  }, [loading, currentUser, fetchSessions]);

  if (loading) return null;
  if (!currentUser) return null;

  const hasChanges = JSON.stringify(grid) !== JSON.stringify(savedGrid);

  const toggleSlot = (slotId, dayIndex) => {
    // Locked slots are held available by submitted applications and cannot be changed
    if (grid[slotId]?.[dayIndex] === 'locked') return;

    setSaveError('');
    setGrid((prev) => {
      const current = prev[slotId][dayIndex];
      const next = current === 'available' ? 'empty' : 'available';
      return {
        ...prev,
        [slotId]: {
          ...prev[slotId],
          [dayIndex]: next,
        },
      };
    });
  };

  // Returns to the page the timetable was opened from (Profile, Applications, ...);
  // falls back to the profile page when the timetable was opened directly with no
  // in-app history entry, since navigate(-1) would do nothing in that case
  const goBack = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/profile');
    }
  };

  const handleSave = async () => {
    const availability = [];
    timeSlots.forEach((slot) => {
      Object.entries(grid[slot.id]).forEach(([dayIndex, status]) => {
        if (status === 'available' || status === 'locked') {
          availability.push({ dayOfWeek: Number(dayIndex), timeSlotId: slot.id });
        }
      });
    });

    const response = await execute(() => api.put('/availability', { availability }));
    if (response && response.status === 200) {
      setSavedGrid(JSON.parse(JSON.stringify(grid)));
      setSaveError('');
      goBack();
    } else {
      setSaveError(response?.data?.message || 'Could not save your availability. Please try again.');
    }
  };

  const handleCancel = () => {
    goBack();
  };

  // Adds the slots extracted from the uploaded timetable PDF to the grid.
  // Locked slots keep their locked state and the change still goes through
  // Save Changes, so nothing is written without an explicit review.
  const handleApplyExtracted = (extractedSlots) => {
    setSaveError('');
    setAppliedInfo(
      `Added ${extractedSlots.length} slot${extractedSlots.length === 1 ? '' : 's'} from your timetable PDF — review the grid and save.`,
    );
    setGrid((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      extractedSlots.forEach(({ dayOfWeek, timeSlotId }) => {
        if (next[timeSlotId]?.[dayOfWeek] === 'empty') {
          next[timeSlotId][dayOfWeek] = 'available';
        }
      });
      return next;
    });
  };

  const renderSlotLabel = (status) => {
    if (status === 'available') {
      return (
        <div className="absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary cursor-pointer">
          Available
        </div>
      );
    }
    if (status === 'locked') {
      return (
        <div className="absolute inset-1 bg-urgent-orange/20 border border-urgent-orange/30 rounded flex items-center justify-center gap-1 font-label-caps text-[10px] text-urgent-orange cursor-not-allowed">
          <span className="material-symbols-outlined text-[12px]">lock</span>
          Locked
        </div>
      );
    }
    return null;
  };

  return (
    <AppLayout title="Edit Timetable" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-display text-primary">Edit Timetable</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Click on a time slot to mark yourself as available.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCancel}>Cancel</Button>
            <Button onClick={handleSave} disabled={!hasChanges} loading={isLoading} className="min-w-40">
              Save Changes
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="flex flex-wrap items-center gap-gutter">
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
        )}
        {saveError && <ErrorMessage>{saveError}</ErrorMessage>}

        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
          <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                Weekly Availability
              </h3>
              <p className="font-body-sm text-outline mt-1">
                Select the slots when you are free to tutor.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 font-body-sm text-on-surface-variant">
                <span className="w-3 h-3 rounded-sm bg-primary/20 border border-primary/30"></span>
                Available
              </span>
              <span className="flex items-center gap-1.5 font-body-sm text-on-surface-variant">
                <span className="w-3 h-3 rounded-sm bg-urgent-orange/20 border border-urgent-orange/30"></span>
                Locked
              </span>
              <span className="flex items-center gap-1.5 font-body-sm text-on-surface-variant">
                <span className="w-3 h-3 rounded-sm bg-surface-container-lowest border border-outline-variant/30"></span>
                Unavailable
              </span>
            </div>
          </div>

          <div className="overflow-x-auto calendar-scroll">
            <div className="min-w-[600px] grid grid-cols-6 gap-px bg-outline-variant/30">
              <div className="bg-surface-container-lowest p-2" />
              {DAYS.map((d) => (
                <div
                  key={d}
                  className="bg-surface-container-lowest p-2 text-center font-label-caps text-label-caps text-on-surface-variant"
                >
                  {d}
                </div>
              ))}

              {timeSlots.map((slot) => (
                <div key={slot.id} className="contents">
                  <div className="bg-surface-container-lowest p-2 text-right font-data-mono text-body-sm text-outline border-b border-outline-variant/20">
                    {minutesToLabel(slot.startMinute)}-{minutesToLabel(slot.endMinute)}
                  </div>
                  {DAYS.map((day, dayIndex) => {
                    const status = grid[slot.id]?.[dayIndex] || 'empty';
                    const locked = status === 'locked';
                    const cellClass = locked
                      ? 'bg-urgent-orange/5 cursor-not-allowed'
                      : status === 'available'
                      ? 'bg-primary/5 hover:bg-primary/10 cursor-pointer'
                      : 'bg-surface-container-lowest hover:bg-surface-container-low cursor-pointer';
                    return (
                      <div
                        key={`${slot.id}-${day}`}
                        onClick={locked ? undefined : () => toggleSlot(slot.id, dayIndex)}
                        className={`p-2 border-b border-outline-variant/20 relative transition-colors ${cellClass}`}
                      >
                        <div className="h-8">
                          {renderSlotLabel(status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Uploaded timetable PDF (same reusable card as on the Profile page) ── */}
        <div className="mt-gutter">
          {appliedInfo && (
            <p className="mb-stack-sm font-body-sm text-primary flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              {appliedInfo}
            </p>
          )}
          <TimetableUploadCard onApply={handleApplyExtracted} />
        </div>

        {/* ── Upcoming sessions (tutors only) ── */}
        {role === 'tutor' && sessions.length > 0 && (
          <div className="mt-gutter bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Upcoming Sessions
                </h3>
                <p className="font-body-sm text-outline mt-1">
                  Your scheduled tutoring sessions.
                </p>
              </div>
              <span className="font-data-mono text-body-sm text-on-surface-variant">
                {sessions.length} session{sessions.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-unit">
              {sessions.map((session) => {
                // /sessions/mine only carries this tutor's own sessions — the
                // chip never has to describe another tutor's row.
                const chip =
                  session.status === 'UNASSIGNED'
                    ? { cls: 'bg-urgent-orange/10 text-urgent-orange', label: 'Excused' }
                    : session.status === 'PENDING'
                      ? { cls: 'bg-trust-blue/10 text-trust-blue', label: 'Volunteer pending' }
                      : { cls: 'bg-primary/10 text-primary', label: 'You lead' };

                return (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit px-stack-md py-unit border-b border-outline-variant/20 last:border-0"
                  >
                    <span className="font-data-mono text-data-mono font-semibold text-primary min-w-[5.5rem]">
                      {session.course?.courseCode ?? '—'}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0">
                      {session.course?.courseName}
                    </span>
                    <span className="font-data-mono text-body-sm text-on-surface-variant">
                      {formatSessionDate(session.date)} · {formatSessionTimeRange(session)}
                    </span>
                    {session.courseSlot?.venue && (
                      <span className="font-body-sm text-body-sm text-outline">
                        {session.courseSlot.venue}
                      </span>
                    )}
                    <span className={`${chip.cls} px-2 py-0.5 rounded font-label-caps text-label-caps`}>
                      {chip.label}
                    </span>
                    {session.excuseReason && (
                      <span className="w-full font-body-sm text-body-sm text-on-surface-variant italic mt-0.5">
                        “{session.excuseReason}”
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default EditTimetable;
