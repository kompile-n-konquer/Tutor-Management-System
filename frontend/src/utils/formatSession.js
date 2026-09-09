// Date/time helpers shared by the tutor dashboard and the volunteer view.

export const formatSessionDate = (date) =>
  new Date(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const formatSessionTime = (time) =>
  new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// Returns the session length in hours (e.g. 1.5), or null when the stored times are unusable.
export const sessionDurationHours = ({ startTime, endTime }) => {
  const durationMs = new Date(endTime) - new Date(startTime);
  if (Number.isNaN(durationMs) || durationMs <= 0) return null;
  return Math.round((durationMs / 3600000) * 10) / 10;
};
