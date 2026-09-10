import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const TIME_SLOTS = [
  '08:00-08:45',
  '09:00-09:45',
  '10:15-11:00',
  '11:15-12:00',
  '12:30-13:15',
  '14:15-15:00',
  '15:15-16:00',
  '16:15-17:00',
];

const buildInitialGrid = () => {
  const grid = {};
  TIME_SLOTS.forEach((time) => {
    grid[time] = {};
    DAYS.forEach((day) => {
      grid[time][day] = 'empty';
    });
  });

  // Dummy availability data
  grid['08:00-08:45'] = { Mon: 'available', Tue: 'empty', Wed: 'available', Thu: 'empty', Fri: 'available' };
  grid['09:00-09:45'] = { Mon: 'available', Tue: 'available', Wed: 'empty', Thu: 'available', Fri: 'empty' };
  grid['10:15-11:00'] = { Mon: 'empty', Tue: 'available', Wed: 'available', Thu: 'empty', Fri: 'available' };
  grid['11:15-12:00'] = { Mon: 'available', Tue: 'empty', Wed: 'available', Thu: 'available', Fri: 'empty' };
  grid['12:30-13:15'] = { Mon: 'empty', Tue: 'empty', Wed: 'empty', Thu: 'empty', Fri: 'empty' };
  grid['14:15-15:00'] = { Mon: 'available', Tue: 'available', Wed: 'empty', Thu: 'available', Fri: 'available' };
  grid['15:15-16:00'] = { Mon: 'empty', Tue: 'available', Wed: 'available', Thu: 'empty', Fri: 'available' };
  grid['16:15-17:00'] = { Mon: 'available', Tue: 'empty', Wed: 'empty', Thu: 'available', Fri: 'empty' };

  return grid;
};

const EditTimetable = () => {
  const navigate = useNavigate();
  const [grid, setGrid] = useState(buildInitialGrid);

  const toggleSlot = (time, day) => {
    setGrid((prev) => {
      const current = prev[time][day];
      const next = current === 'available' ? 'empty' : 'available';
      return {
        ...prev,
        [time]: {
          ...prev[time],
          [day]: next,
        },
      };
    });
  };

  const handleSave = () => {
    navigate('/profile');
  };

  const handleCancel = () => {
    navigate('/profile');
  };

  const renderSlotLabel = (status) => {
    if (status === 'available') {
      return (
        <div className="absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary cursor-pointer">
          Available
        </div>
      );
    }
    return null;
  };

  return (
    <AppLayout role="tutor" title="Edit Timetable" showSearch={false}>
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
            <Button onClick={handleSave} className="min-w-40">Save Changes</Button>
          </div>
        </div>

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

              {TIME_SLOTS.map((time) => (
                <div key={time} className="contents">
                  <div className="bg-surface-container-lowest p-2 text-right font-data-mono text-body-sm text-outline border-b border-outline-variant/20">
                    {time}
                  </div>
                  {DAYS.map((day) => {
                    const status = grid[time][day];
                    return (
                      <div
                        key={`${time}-${day}`}
                        onClick={() => toggleSlot(time, day)}
                        className={`p-2 border-b border-outline-variant/20 relative cursor-pointer transition-colors ${
                          status === 'available' ? 'bg-primary/5 hover:bg-primary/10' : 'bg-surface-container-lowest hover:bg-surface-container-low'
                        }`}
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
