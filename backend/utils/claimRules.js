// Shared claiming rules for hours derived from timeslots and events. Kept pure
// (no database access) so the applications, events and timesheets controllers —
// and the unit tests — all use exactly the same arithmetic.

// Round-up rule: every timeslot counts as at least one full hour, rounded up to
// whole hours (08:00-08:45 -> 1 hour, 14:15-15:00 -> 1 hour)
const slotHours = (startMinute, endMinute) =>
  Math.max(1, Math.ceil((endMinute - startMinute) / 60));

// Whole hours across a set of derived { startMinute, endMinute } times
const timesTotalHours = (times) =>
  times.reduce((total, time) => total + slotHours(time.startMinute, time.endMinute), 0);

// The same date, `months` calendar months earlier. UTC arithmetic throughout —
// event and entry dates are stored at UTC midnight
const monthsBefore = (date, months) => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
};

// A month is 30-31 days, so a tutor may claim more than the monthly cap over a
// longer span as long as every 31-day window stays within it. Windows are
// anchored at each entry's date; returns the first window whose hours exceed the
// cap, or null when they all fit.
const WINDOW_DAYS = 31;

const findExcessiveWindow = (entries, maxHours, windowDays = WINDOW_DAYS) => {
  const sorted = entries
    .map((entry) => ({ date: new Date(entry.workDate), hours: Number(entry.duration) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  for (let i = 0; i < sorted.length; i += 1) {
    const windowEnd = sorted[i].date.getTime() + (windowDays - 1) * 24 * 60 * 60 * 1000;
    let hours = 0;
    let last = sorted[i];
    for (let j = i; j < sorted.length && sorted[j].date.getTime() <= windowEnd; j += 1) {
      hours += sorted[j].hours;
      last = sorted[j];
    }
    if (hours > maxHours) {
      return { start: sorted[i].date, end: last.date, hours };
    }
  }
  return null;
};

// Maps a Date's JS weekday (Sun=0..Sat=6) onto the schema's Mon=0..Fri=4, null on weekends
const dayOfWeekFor = (date) => {
  const jsDay = date.getUTCDay();
  return jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : null;
};

// Times an event runs, derived from the course's tutoring slots on the event date's
// weekday. Events store no time themselves, so editing course slots keeps every
// event correct — same derived-never-stored approach as the availability locks.
const deriveTimes = (courseSlots, dayOfWeek) =>
  courseSlots
    .filter((slot) => slot.dayOfWeek === dayOfWeek)
    .map((slot) => ({ startMinute: slot.timeSlot.startMinute, endMinute: slot.timeSlot.endMinute }))
    .sort((a, b) => a.startMinute - b.startMinute);

// The full timesheet entry an event claim becomes: course, date, description,
// supervisor (the course's lecturer) and round-up duration all derive from the
// event data. Returns null when the course no longer has slots on the event's
// weekday.
const deriveEventEntry = (event) => {
  const times = deriveTimes(event.course?.slots || [], dayOfWeekFor(event.date));
  if (times.length === 0) return null;
  return {
    eventId: event.id,
    courseId: event.courseId,
    supervisorId: event.course?.userId ?? null,
    workDate: event.date,
    duration: timesTotalHours(times),
    description: event.description,
  };
};

module.exports = {
  slotHours,
  timesTotalHours,
  monthsBefore,
  findExcessiveWindow,
  dayOfWeekFor,
  deriveTimes,
  deriveEventEntry,
};
