export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts minutes since midnight (480) into a time label ("08:00")
export const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * SlotGrid
 * Weekly Mon-Fri x time-slot grid shared by the course pages.
 * `grid` maps each timeSlot id to a per-day cell status ('selected' | 'empty').
 * Pass `readOnly` to render a static grid (no clicking, like the Profile timetable).
 */
const SlotGrid = ({ timeSlots, grid, onToggle, readOnly = false, label = 'Tutor' }) => (
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
            const interactive = !readOnly && status !== 'selected';
            return (
              <div
                key={`${slot.id}-${day}`}
                onClick={readOnly ? undefined : () => onToggle(slot.id, dayIndex)}
                className={`p-2 border-b border-outline-variant/20 relative transition-colors ${
                  readOnly ? '' : 'cursor-pointer'
                } ${
                  status === 'selected' ? 'bg-primary/5' : 'bg-surface-container-lowest'
                }${interactive ? ' hover:bg-primary/10' : ''}`}
              >
                <div className="h-8">
                  {status === 'selected' && (
                    <div
                      className={`absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary ${
                        readOnly ? '' : 'cursor-pointer'
                      }`}
                    >
                      {label}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  </div>
);

export default SlotGrid;
