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

// Formats a bare TimeSlot's minutes-since-midnight range (shared by the
// tutor dashboard, the lecturer scheduler and the volunteer view).
export const formatTimeRange = (timeSlot) => {
  if (!timeSlot) return "";
  return `${minutesToTime(timeSlot.startMinute)} – ${minutesToTime(timeSlot.endMinute)}`;
};

// Accepts the full session object (with courseSlot.timeSlot populated).
export const formatSessionTimeRange = (session) => formatTimeRange(session?.courseSlot?.timeSlot);

// Returns the session length in hours (e.g. 1.5), or null when the timeSlot is unusable.
export const sessionDurationHours = (session) => {
  const ts = session?.courseSlot?.timeSlot;
  if (!ts) return null;
  const durationMinutes = ts.endMinute - ts.startMinute;
  if (durationMinutes <= 0) return null;
  return Math.round((durationMinutes / 60) * 10) / 10;
};
