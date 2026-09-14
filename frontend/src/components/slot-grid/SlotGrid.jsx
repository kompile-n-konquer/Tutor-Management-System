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
 * `grid` maps each timeSlot id to a per-day cell status ('selected' | 'locked' | 'empty').
 * 'locked' marks slots held by a submitted application — same design as 'selected'
 * cells but in orange, with a lock icon, and never clickable.
 * Pass `readOnly` to render a static grid (no clicking, like the Profile timetable).
 * Pass `fill` to make the grid stretch to fill its parent container height
 * (rows distribute evenly, cells match Profile sizing with no fixed inner height).
 */
const SlotGrid = ({ timeSlots, grid, onToggle, readOnly = false, label = 'Tutor', fill = false }) => {
  const renderCellLabel = (status) => {
    if (status === 'selected') {
      return (
        <div
          className={`absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary ${
            readOnly ? '' : 'cursor-pointer'
          }`}
        >
          {label}
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
    <div className={fill ? 'h-full' : 'overflow-x-auto calendar-scroll'}>
      <div className={`grid grid-cols-6 gap-px bg-outline-variant/30 ${fill ? 'h-full' : 'min-w-[600px]'}`}>
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
              const interactive = !readOnly && status !== 'selected' && !locked;
              return (
                <div
                  key={`${slot.id}-${day}`}
                  onClick={!readOnly && !locked ? () => onToggle(slot.id, dayIndex) : undefined}
                  className={`p-2 border-b border-outline-variant/20 relative transition-colors ${
                    locked ? 'cursor-not-allowed' : readOnly ? '' : 'cursor-pointer'
                  } ${
                    status === 'selected' ? 'bg-primary/5' : locked ? 'bg-urgent-orange/5' : 'bg-surface-container-lowest'
                  }${interactive ? ' hover:bg-primary/10' : ''}`}
                >
                  {fill ? renderCellLabel(status) : <div className="h-8">{renderCellLabel(status)}</div>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SlotGrid;
