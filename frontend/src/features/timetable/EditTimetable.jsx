import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import useAuth from '../../hooks/useAuth';
import ErrorMessage from '../../components/error-message/ErrorMessage';

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
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [grid, setGrid] = useState({}); // { [slotId]: { [dayIndex]: 'available' | 'locked' | 'empty' } }
  const [savedGrid, setSavedGrid] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (loading || !currentUser) return;

    const loadAvailability = async () => {
      const response = await execute(() => api.get('/availability'));
      if (!response || response.status !== 200) {
        setLoadError('Could not load your availability. Please try again.');
        return;
      }

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
  }, [currentUser, loading, execute]);

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

        {loadError && <ErrorMessage>{loadError}</ErrorMessage>}
        {saveError && <ErrorMessage>{saveError}</ErrorMessage>}

        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
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
      </div>
    </AppLayout>
  );
};

export default EditTimetable;
