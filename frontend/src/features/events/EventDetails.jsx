import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SlotGrid, { minutesToLabel } from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

// Event dates are stored at UTC midnight, so format them in UTC to keep the
// weekday matching the one the timeslots were derived from
const formatEventDate = (isoString) =>
  new Date(isoString).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatTimestamp = (isoString) =>
  new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// Builds the SlotGrid grid map from the event's course slots: { [slotId]: { [day]: 'selected' | 'empty' } }
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

const EventDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [event, setEvent] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [grid, setGrid] = useState({});
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const role = currentUser?.role?.toLowerCase();
  const canViewEvents = role === 'tutor' || role === 'lecturer' || role === 'organiser' || role === 'admin';

  // Tutors, lecturers and organisers may view events
  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!canViewEvents) {
      navigate('/tutor-dashboard');
    }
  }, [currentUser, loading, navigate, canViewEvents]);

  useEffect(() => {
    if (loading || !currentUser || !canViewEvents) return;

    const loadEvent = async () => {
      const [eventResponse, slotsResponse] = await execute(() =>
        Promise.all([api.get(`/events/${id}`), api.get('/courses/time-slots')])
      );

      if (!eventResponse || !slotsResponse) return;

      if (eventResponse.status !== 200) {
        setError(eventResponse?.data?.message || 'Could not load the event. Please go back and try again.');
        return;
      }
      if (slotsResponse.status !== 200) {
        setError('Could not load the time slots. Please refresh the page.');
        return;
      }

      setEvent(eventResponse.data);
      setTimeSlots(slotsResponse.data);
      setGrid(buildGrid(slotsResponse.data, eventResponse.data.courseSlots));
      setError('');
    };

    loadEvent();
  }, [currentUser, loading, canViewEvents, id, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser || !canViewEvents) return null;

  return (
    <AppLayout role={role} title="Events">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">
              {event ? `${event.courseCode}` : 'Event'}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {event ? event.courseName : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="min-w-40" onClick={() => navigate('/events')}>
              Back to Events
            </Button>
            {event?.canEdit && (
              <Button className="min-w-40" onClick={() => navigate(`/events/${event.id}/edit`)}>
                Edit Event
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{error}</ErrorMessage>
            <Button
              className="min-w-32"
              onClick={() => {
                setError('');
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {isLoading && !event && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter" aria-hidden="true">
            <div className="lg:col-span-4 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
              <div className="h-4 w-28 rounded bg-surface-container-high mb-stack-lg" />
              <div className="space-y-stack-lg">
                {[0, 1, 2].map((row) => (
                  <div key={row} className="space-y-unit">
                    <div className="h-3 w-16 rounded bg-surface-container-high" />
                    <div className="h-4 rounded bg-surface-container-high/60" />
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-8 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-stack-md">
              <div className="h-4 w-32 rounded bg-surface-container-high" />
              <div className="h-24 rounded bg-surface-container-high/60" />
              <div className="h-24 rounded bg-surface-container-high/60" />
            </div>
          </div>
        )}

        {event && (
          <div className="space-y-gutter">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
              {/* Event details — left column */}
              <div className="lg:col-span-4">
                <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                  <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Event Details
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Core information about this event.
                    </p>
                  </div>
                  <div className="flex-1 space-y-6">
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Date</p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">{formatEventDate(event.date)}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Time</p>
                      <div className="mt-1">
                        {event.times.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {event.times.map((time, index) => (
                              <span
                                key={index}
                                className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                              >
                                {minutesToLabel(time.startMinute)}-{minutesToLabel(time.endMinute)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="font-body-md text-outline">No timeslot on this weekday</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Description</p>
                      <p className="font-body-md text-on-surface mt-1">
                        <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold capitalize">
                          {event.description}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Lecturer</p>
                      <p className="font-body-md text-on-surface mt-1">{event.lecturer || 'Unknown'}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Created</p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">{formatTimestamp(event.createdAt)}</p>
                    </div>
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
                        The weekly slots when this course is tutored. The event's time is derived from the slots on the event's weekday.
                      </p>
                    </div>
                    <span className="font-body-sm text-on-surface-variant">{event.courseSlots.length} slots</span>
                  </div>

                  <div className="flex-1 min-h-0">
                    <SlotGrid timeSlots={timeSlots} grid={grid} readOnly label="Tutor" fill />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default EventDetails;
