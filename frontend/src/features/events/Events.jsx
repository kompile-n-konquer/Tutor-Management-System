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

const EVENTS_PER_COURSE_PAGE = 5;

const Events = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ from: '', to: '' });
  const [coursePages, setCoursePages] = useState({});

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
      const searchParams = new URLSearchParams();
      if (appliedFilters.from) searchParams.set('from', appliedFilters.from);
      if (appliedFilters.to) searchParams.set('to', appliedFilters.to);
      const query = searchParams.toString();
      const response = await execute(() => api.get(query ? `/events?${query}` : '/events'));
      if (response && response.status === 200) {
        setEvents(response.data);
        setError('');
      } else {
        setError(response?.data?.message || 'Could not load the events. Please refresh the page.');
      }
      setLoaded(true);
    };

    loadEvents();
  }, [currentUser, loading, canViewEvents, execute, reloadKey, appliedFilters]);

  const applyFilters = (event) => {
    event.preventDefault();
    setExpandedCourse(null);
    setCoursePages({});
    setAppliedFilters({ from: fromDate, to: toDate });
    setReloadKey((key) => key + 1);
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setExpandedCourse(null);
    setCoursePages({});
    setAppliedFilters({ from: '', to: '' });
    setReloadKey((key) => key + 1);
  };

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

        <form
          onSubmit={applyFilters}
          className="mb-stack-lg rounded-xl border border-surface-variant bg-surface-container-lowest p-stack-md"
        >
          <fieldset className="flex flex-wrap items-end gap-gutter">
            <legend className="mb-stack-sm font-label-caps text-label-caps text-on-surface-variant">
              Filter events by date
            </legend>
            <label className="flex flex-col gap-1 font-body-sm text-on-surface-variant">
              From date
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="rounded border border-surface-variant bg-surface px-3 py-2 text-on-surface"
              />
            </label>
            <label className="flex flex-col gap-1 font-body-sm text-on-surface-variant">
              To date
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="rounded border border-surface-variant bg-surface px-3 py-2 text-on-surface"
              />
            </label>
            <Button type="submit" className="min-w-28">
              Apply filters
            </Button>
            <Button type="button" className="min-w-28" onClick={clearFilters}>
              Clear filters
            </Button>
          </fieldset>
          <p className="mt-stack-sm font-body-sm text-on-surface-variant">
            Leave either date blank to see events only before or after the selected date.
          </p>
        </form>

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
              const totalPages = Math.ceil(group.events.length / EVENTS_PER_COURSE_PAGE);
              const currentPage = Math.min(coursePages[group.key] || 0, totalPages - 1);
              const visibleEvents = group.events.slice(
                currentPage * EVENTS_PER_COURSE_PAGE,
                (currentPage + 1) * EVENTS_PER_COURSE_PAGE
              );
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
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                            <th className="py-stack-sm px-stack-md">Date</th>
                            <th className="py-stack-sm px-stack-md">Time</th>
                            <th className="py-stack-sm px-stack-md">Description</th>
                            <th className="py-stack-sm px-stack-md">Lecturer</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-variant font-body-md">
                          {visibleEvents.map((event) => (
                            <tr
                              key={event.id}
                              onClick={() => navigate(`/events/${event.id}`)}
                              className="cursor-pointer hover:bg-surface-container-low transition-colors"
                            >
                              <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                                {formatDate(event.date)}
                              </td>
                              <td className="py-stack-sm px-stack-md">
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
                              <td className="py-stack-sm px-stack-md capitalize">{event.description}</td>
                              <td className="py-stack-sm px-stack-md">{event.lecturer || 'Unknown'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-gutter border-t border-surface-variant px-stack-md py-stack-sm">
                          <Button
                            type="button"
                            className="min-w-24"
                            disabled={currentPage === 0}
                            onClick={() =>
                              setCoursePages((pages) => ({ ...pages, [group.key]: currentPage - 1 }))
                            }
                          >
                            Previous
                          </Button>
                          <p className="font-body-sm text-on-surface-variant" aria-live="polite">
                            Page {currentPage + 1} of {totalPages}
                          </p>
                          <Button
                            type="button"
                            className="min-w-24"
                            disabled={currentPage === totalPages - 1}
                            onClick={() =>
                              setCoursePages((pages) => ({ ...pages, [group.key]: currentPage + 1 }))
                            }
                          >
                            Next
                          </Button>
                        </div>
                      )}
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
