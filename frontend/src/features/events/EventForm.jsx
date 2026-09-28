import { useState } from 'react';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SearchSelect from '../../components/search-select/SearchSelect';
import SlotGrid, { DAYS, minutesToLabel } from '../../components/slot-grid/SlotGrid';

// Same selectable descriptions as the timesheet editor
const DESCRIPTIONS = [
  { id: 'tutoring', name: 'Tutoring' },
  { id: 'marking', name: 'Marking' },
  { id: 'invigilation', name: 'Invigilation' },
  { id: 'admin', name: 'Admin' },
];

// Maps a YYYY-MM-DD date onto the schema's Mon=0..Fri=4 weekday, null on weekends
const dayOfWeekFor = (dateString) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const jsDay = date.getUTCDay();
  return jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : null;
};

// Builds the SlotGrid grid map from a course's slots: { [slotId]: { [day]: 'selected' | 'empty' } }
const buildGrid = (timeSlots, courseSlots) => {
  const grid = {};
  timeSlots.forEach((slot) => {
    grid[slot.id] = { 0: 'empty', 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' };
  });
  courseSlots.forEach((slot) => {
    if (grid[slot.timeSlotId]) {
      grid[slot.timeSlotId][slot.dayOfWeek] = 'selected';
    }
  });
  return grid;
};

/**
 * EventForm
 * Shared by the add and edit pages, laid out like the course editor. The course,
 * date and description are chosen on the left while the right card shows the
 * selected course's tutoring slots. The event's time is derived from the slots
 * that fall on the chosen date's weekday — the same derivation the backend
 * performs, so the preview always matches what is stored.
 *
 * `courses` comes from GET /events/my-courses: [{ id, courseCode, courseName,
 * slots: [{ dayOfWeek, timeSlotId, startMinute, endMinute }] }], and `timeSlots`
 * from GET /courses/time-slots.
 */
const EventForm = ({ courses, timeSlots, event, onSubmit, onCancel, submitLabel = 'Save Event', isSubmitting }) => {
  const [courseId, setCourseId] = useState(event?.courseId ?? null);
  const [date, setDate] = useState(event?.date ? event.date.split('T')[0] : '');
  const [description, setDescription] = useState(event?.description ?? null);
  const [error, setError] = useState('');

  const selectedCourse = courses.find((course) => course.id === courseId) || null;
  const dayOfWeek = date ? dayOfWeekFor(date) : null;

  // Times derived exactly like the backend: the course's slots on that weekday
  const derivedTimes =
    selectedCourse && dayOfWeek !== null
      ? selectedCourse.slots
          .filter((slot) => slot.dayOfWeek === dayOfWeek)
          .sort((a, b) => a.startMinute - b.startMinute)
      : [];

  const courseOptions = courses.map((course) => ({
    id: course.id,
    code: course.courseCode,
    name: course.courseName,
  }));

  const grid = selectedCourse ? buildGrid(timeSlots, selectedCourse.slots) : {};

  const canSubmit = Boolean(courseId && date && description && derivedTimes.length > 0);

  const handleSubmit = async (formEvent) => {
    formEvent.preventDefault();
    setError('');

    if (dayOfWeek === null) {
      setError('Events can only be scheduled from Monday to Friday.');
      return;
    }
    if (selectedCourse && derivedTimes.length === 0) {
      setError(`${selectedCourse.courseCode} has no tutoring timeslots on a ${DAYS[dayOfWeek]}. Pick another date or course.`);
      return;
    }

    const result = await onSubmit({ courseId, date, description });

    if (!result?.ok) {
      setError(result?.message || 'Could not save the event. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-gutter">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* Event details — left column */}
        <div className="lg:col-span-4">
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
            <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                Event Details
              </h3>
              <p className="font-body-sm text-outline mt-1">
                Fill in the event information below.
              </p>
            </div>
            <div className="flex-1 space-y-8">
              <SearchSelect
                label="Course"
                options={courseOptions}
                value={courseId}
                onChange={(id) => {
                  setError('');
                  setCourseId(id);
                }}
                placeholder="Select a course..."
                displayOptionFn={(o) => `${o.code} - ${o.name}`}
                displayFn={(o) => (o?.code ? `${o.code} - ${o.name}` : '')}
              />
              <div>
                <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setError('');
                    setDate(e.target.value);
                  }}
                  className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-colors h-11 shadow-sm"
                />
              </div>
              <SearchSelect
                label="Description"
                options={DESCRIPTIONS}
                value={description}
                onChange={(id) => {
                  setError('');
                  setDescription(id);
                }}
                placeholder="Task type"
              />
            </div>
          </div>
        </div>

        {/* Tutoring slots — right column */}
        <div className="lg:col-span-8">
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
            <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Tutoring Slots
                </h3>
                <p className="font-body-sm text-outline mt-1">
                  The course's weekly tutoring slots. The event's time is derived from the slots on the chosen weekday.
                </p>
              </div>
              {selectedCourse && (
                <span className="font-body-sm text-on-surface-variant">{selectedCourse.slots.length} slots</span>
              )}
            </div>

            <div className="flex-1 min-h-0">
              {selectedCourse ? (
                <SlotGrid timeSlots={timeSlots} grid={grid} readOnly label="Tutor" fill />
              ) : (
                <p className="font-body-md text-on-surface-variant h-full flex items-center justify-center text-center">
                  Select a course to see its tutoring timeslots.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Derived time preview — the event stores no time of its own */}
      <div className="bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm">
        <div className="flex flex-wrap items-center gap-gutter">
          <span className="material-symbols-outlined text-primary">schedule</span>
          <p className="font-body-md text-on-surface flex-1 min-w-fit">
            {selectedCourse && date ? (
              dayOfWeek === null ? (
                <>Events can only be scheduled from Monday to Friday.</>
              ) : derivedTimes.length > 0 ? (
                <>
                  The time is derived from {selectedCourse.courseCode}'s timeslots on {DAYS[dayOfWeek]}:{' '}
                  <span className="font-data-mono font-semibold">
                    {derivedTimes
                      .map((time) => `${minutesToLabel(time.startMinute)}-${minutesToLabel(time.endMinute)}`)
                      .join(', ')}
                  </span>
                </>
              ) : (
                <>
                  {selectedCourse.courseCode} has no tutoring timeslots on a {DAYS[dayOfWeek]}. Pick another date or course.
                </>
              )
            ) : (
              <>Select a course and a date to see the derived event time.</>
            )}
          </p>
        </div>
      </div>

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <div className="flex gap-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!canSubmit} loading={isSubmitting} className="min-w-40">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
};

export default EventForm;
