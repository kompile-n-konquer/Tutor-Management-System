// Date/time helpers shared by the tutor dashboard and the volunteer view.
// Time info now lives on session.courseSlot.timeSlot (minutes since midnight),
// not directly on the session (schema refactor in main).

const minutesToTime = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${mins.toString().padStart(2, '0')} ${ampm}`;
};

export const formatSessionDate = (date) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

// Accepts the full session object (with courseSlot.timeSlot populated).
export const formatSessionTimeRange = (session) => {
  const ts = session?.courseSlot?.timeSlot;
  if (!ts) return '';
  return `${minutesToTime(ts.startMinute)} – ${minutesToTime(ts.endMinute)}`;
};

// Returns the session length in hours (e.g. 1.5), or null when the timeSlot is unusable.
export const sessionDurationHours = (session) => {
  const ts = session?.courseSlot?.timeSlot;
  if (!ts) return null;
  const durationMinutes = ts.endMinute - ts.startMinute;
  if (durationMinutes <= 0) return null;
  return Math.round((durationMinutes / 60) * 10) / 10;
};
