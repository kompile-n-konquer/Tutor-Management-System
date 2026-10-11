import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { minutesToLabel } from '../../components/slot-grid/SlotGrid';

// Event dates are stored at UTC midnight, so format them in UTC to keep the
// weekday matching the one the timeslots were derived from
const formatDate = (isoString) =>
  new Date(isoString).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

// Millisecond timestamp for "today", used to count each group's upcoming events.
const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const Events = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const role = currentUser?.role?.toLowerCase();
  const canViewEvents = role === 'tutor' || role === 'lecturer' || role === 'organiser' || role === 'admin';
  const isLecturer = role === 'lecturer';

  // Key of the course group whose events are expanded — one group at a time.
  const [expandedCourse, setExpandedCourse] = useState(null);

  // Group the flat /events payload by course. Each group carries its events
  // ordered newest-first plus the counts the summary row shows.
  const courseGroups = useMemo(() => {
    const groups = new Map();

    events.forEach((event) => {
      const key = event.courseId ?? event.courseCode;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          courseCode: event.courseCode,
          courseName: event.courseName,
          events: [],
        });
      }
      groups.get(key).events.push(event);
    });

    const today = startOfToday();
    return [...groups.values()]
      .map((group) => {
        const sorted = [...group.events].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || a.id - b.id
        );
        return {
          ...group,
          events: sorted,
          upcoming: sorted.filter((event) => new Date(event.date).getTime() >= today).length,
        };
      })
      .sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''));
  }, [events]);

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

    const loadEvents = async () => {
      const response = await execute(() => api.get('/events'));
      if (response && response.status === 200) {
        setEvents(response.data);
        setError('');
      } else {
        setError(response?.data?.message || 'Could not load the events. Please refresh the page.');
      }
      setLoaded(true);
    };

    loadEvents();
  }, [currentUser, loading, canViewEvents, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser || !canViewEvents) return null;

  const emptyMessage =
    role === 'tutor'
      ? 'No events have been scheduled for your allocated courses yet.'
      : role === 'lecturer'
      ? 'You have not created any events yet.'
      : 'No events have been created yet.';

  return (
    <AppLayout role={role} title="Events">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Events</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {isLecturer
                ? 'Events for the tutoring timeslots of your courses. Click a course to expand its events.'
                : 'Events scheduled for the tutoring timeslots of your courses. Click a course to expand its events.'}
            </p>
          </div>
          {isLecturer && (
            <div>
              <Button className="min-w-40" onClick={() => navigate('/events/add')}>
                Create Event
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-stack-lg flex flex-wrap items-center gap-gutter">
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

        {isLoading && !loaded ? (
          <div className="space-y-stack-sm" aria-hidden="true">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="animate-pulse rounded-xl bg-surface-container-lowest border border-surface-variant shadow-sm px-stack-md py-stack-md flex flex-wrap items-center gap-x-stack-md gap-y-unit"
              >
                <div className="h-4 w-20 rounded bg-surface-container-high" />
                <div className="h-4 w-48 rounded bg-surface-container-high" />
                <div className="h-4 w-32 rounded bg-surface-container-high ml-auto" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-stack-md">
            {courseGroups.map((group) => {
              const isExpanded = expandedCourse === group.key;
              const groupId = `course-events-${group.key}`;
              return (
                <section
                  key={group.key}
                  className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedCourse(isExpanded ? null : group.key)}
                    aria-expanded={isExpanded}
                    aria-controls={groupId}
                    className="w-full flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-md py-stack-md text-left cursor-pointer hover:bg-surface-container-low transition-colors"
                  >
                    <span className="font-data-mono text-data-mono font-bold text-primary shrink-0">
                      {group.courseCode}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface flex-1 min-w-[10rem] break-words">
                      {group.courseName}
                    </span>
                    <span className="font-label-caps text-label-caps text-on-surface-variant shrink-0">
                      {group.events.length} event{group.events.length === 1 ? '' : 's'} · {group.upcoming} upcoming
                    </span>
                    <span
                      className={`material-symbols-outlined text-on-surface-variant shrink-0 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </button>

                  {isExpanded && (
                    <div id={groupId} className="border-t border-surface-variant overflow-x-auto">
                      <table className="responsive-table w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                            <th className="py-stack-sm px-stack-md">Date</th>
                            <th className="py-stack-sm px-stack-md">Time</th>
                            <th className="py-stack-sm px-stack-md">Description</th>
                            <th className="py-stack-sm px-stack-md">Lecturer</th>
                          </tr>
                        </thead>
                        <tbody className="font-body-md">
                          {group.events.map((event) => (
                            <tr
                              key={event.id}
                              onClick={() => navigate(`/events/${event.id}`)}
                              className="cursor-pointer hover:bg-surface-container-low transition-colors"
                            >
                              <td data-label="Date" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                                {formatDate(event.date)}
                              </td>
                              <td data-label="Time" className="py-stack-sm px-stack-md">
                                {event.times.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {event.times.map((time, index) => (
                                      <span
                                        key={`${event.id}-${index}`}
                                        className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                                      >
                                        {minutesToLabel(time.startMinute)}-{minutesToLabel(time.endMinute)}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-outline text-sm">No timeslot on this weekday</span>
                                )}
                              </td>
                              <td data-label="Description" className="py-stack-sm px-stack-md capitalize">{event.description}</td>
                              <td data-label="Lecturer" className="py-stack-sm px-stack-md">{event.lecturer || 'Unknown'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Events;
