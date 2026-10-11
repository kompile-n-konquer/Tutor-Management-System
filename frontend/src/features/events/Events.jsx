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
  const [coursePages, setCoursePages] = useState({});
  const [courseFilters, setCourseFilters] = useState({});
  const [filterDrafts, setFilterDrafts] = useState({});
  const [openFilterCourse, setOpenFilterCourse] = useState(null);

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

  const openCourseFilter = (key) => {
    setFilterDrafts((drafts) => ({
      ...drafts,
      [key]: courseFilters[key] || { from: '', to: '' },
    }));
    setOpenFilterCourse(key);
  };

  const applyCourseFilter = (key) => {
    const filter = filterDrafts[key] || { from: '', to: '' };
    setCourseFilters((filters) => ({ ...filters, [key]: filter }));
    setCoursePages((pages) => ({ ...pages, [key]: 0 }));
    setOpenFilterCourse(null);
  };

  const clearCourseFilter = (key) => {
    setCourseFilters((filters) => {
      const remainingFilters = { ...filters };
      delete remainingFilters[key];
      return remainingFilters;
    });
    setFilterDrafts((drafts) => ({ ...drafts, [key]: { from: '', to: '' } }));
    setCoursePages((pages) => ({ ...pages, [key]: 0 }));
    setOpenFilterCourse(null);
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
              const filter = courseFilters[group.key] || { from: '', to: '' };
              const isFilterActive = Boolean(filter.from || filter.to);
              const filteredEvents = group.events.filter((event) => {
                const eventDate = new Date(event.date).toISOString().slice(0, 10);
                return (!filter.from || eventDate >= filter.from) && (!filter.to || eventDate <= filter.to);
              });
              const filteredUpcoming = filteredEvents.filter(
                (event) => new Date(event.date).getTime() >= startOfToday()
              ).length;
              const totalPages = Math.ceil(filteredEvents.length / EVENTS_PER_COURSE_PAGE);
              const currentPage = Math.min(coursePages[group.key] || 0, Math.max(totalPages - 1, 0));
              const visibleEvents = filteredEvents.slice(
                currentPage * EVENTS_PER_COURSE_PAGE,
                (currentPage + 1) * EVENTS_PER_COURSE_PAGE
              );
              const filterPopupId = `course-filter-${group.key}`;
              const draft = filterDrafts[group.key] || filter;
              return (
                <section
                  key={group.key}
                  className="relative bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm overflow-visible"
                >
                  <div className="flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-md py-stack-md">
                    <button
                      type="button"
                      onClick={() => setExpandedCourse(isExpanded ? null : group.key)}
                      aria-expanded={isExpanded}
                      aria-controls={groupId}
                      className="flex flex-1 items-center gap-x-stack-md text-left cursor-pointer hover:text-primary transition-colors min-w-[14rem]"
                    >
                      <span className="font-data-mono text-data-mono font-bold text-primary shrink-0">
                        {group.courseCode}
                      </span>
                      <span className="font-body-md text-body-md text-on-surface break-words">
                        {group.courseName}
                      </span>
                      <span
                        className={`material-symbols-outlined text-on-surface-variant shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      >
                        expand_more
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openFilterCourse === group.key
                          ? setOpenFilterCourse(null)
                          : openCourseFilter(group.key)
                      }
                      aria-label={`Filter ${group.courseCode} events by date`}
                      aria-haspopup="dialog"
                      aria-expanded={openFilterCourse === group.key}
                      aria-controls={filterPopupId}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                        isFilterActive
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-surface-variant text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[1.15rem]" aria-hidden="true">filter_alt</span>
                    </button>
                    <span className="font-label-caps text-label-caps text-on-surface-variant shrink-0">
                      {filteredEvents.length} event{filteredEvents.length === 1 ? '' : 's'} · {filteredUpcoming} upcoming
                    </span>
                  </div>

                  {openFilterCourse === group.key && (
                    <div
                      id={filterPopupId}
                      role="dialog"
                      aria-label={`Filter ${group.courseCode} events by date`}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setOpenFilterCourse(null);
                      }}
                      className="absolute right-stack-md top-[4.75rem] z-10 w-[min(22rem,calc(100%-2rem))] rounded-xl border border-surface-variant bg-surface-container-lowest p-stack-md shadow-bento"
                    >
                      <div className="mb-stack-sm flex items-center justify-between gap-gutter">
                        <p className="font-label-caps text-label-caps text-on-surface">Filter {group.courseCode}</p>
                        <button
                          type="button"
                          className="text-on-surface-variant hover:text-on-surface"
                          onClick={() => setOpenFilterCourse(null)}
                          aria-label="Close date filter"
                        >
                          <span className="material-symbols-outlined" aria-hidden="true">close</span>
                        </button>
                      </div>
                      <div className="grid gap-stack-sm sm:grid-cols-2">
                        <label className="flex flex-col gap-1 font-body-sm text-on-surface-variant">
                          From date
                          <input
                            type="date"
                            value={draft.from}
                            onChange={(event) =>
                              setFilterDrafts((drafts) => ({
                                ...drafts,
                                [group.key]: { ...draft, from: event.target.value },
                              }))
                            }
                            className="rounded-lg border border-surface-variant bg-surface px-3 py-2 text-on-surface"
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-body-sm text-on-surface-variant">
                          To date
                          <input
                            type="date"
                            value={draft.to}
                            onChange={(event) =>
                              setFilterDrafts((drafts) => ({
                                ...drafts,
                                [group.key]: { ...draft, to: event.target.value },
                              }))
                            }
                            className="rounded-lg border border-surface-variant bg-surface px-3 py-2 text-on-surface"
                          />
                        </label>
                      </div>
                      <div className="mt-stack-md flex justify-end gap-stack-sm">
                        <button
                          type="button"
                          className="rounded-lg px-3 py-2 font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-high"
                          onClick={() => clearCourseFilter(group.key)}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-primary px-3 py-2 font-label-caps text-label-caps text-on-primary hover:bg-primary-container"
                          onClick={() => applyCourseFilter(group.key)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}

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
                      {totalPages > 1 && (
                        <nav
                          className="flex flex-wrap items-center justify-center gap-1 border-t border-surface-variant px-stack-md py-stack-sm"
                          aria-label={`${group.courseCode} event pages`}
                        >
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={currentPage === 0}
                            onClick={() =>
                              setCoursePages((pages) => ({ ...pages, [group.key]: currentPage - 1 }))
                            }
                            aria-label="Previous page"
                          >
                            <span className="material-symbols-outlined text-[1.15rem]" aria-hidden="true">arrow_back</span>
                          </button>
                          {Array.from({ length: totalPages }, (_, page) => (
                            <button
                              key={page}
                              type="button"
                              onClick={() => setCoursePages((pages) => ({ ...pages, [group.key]: page }))}
                              aria-current={page === currentPage ? 'page' : undefined}
                              aria-label={`Page ${page + 1}`}
                              className={`flex h-9 min-w-9 items-center justify-center rounded-full px-2 font-data-mono text-body-sm transition-colors ${
                                page === currentPage
                                  ? 'bg-primary text-on-primary shadow-sm'
                                  : 'text-on-surface-variant hover:bg-surface-container-high'
                              }`}
                            >
                              {page + 1}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={currentPage === totalPages - 1}
                            onClick={() =>
                              setCoursePages((pages) => ({ ...pages, [group.key]: currentPage + 1 }))
                            }
                            aria-label="Next page"
                          >
                            <span className="material-symbols-outlined text-[1.15rem]" aria-hidden="true">arrow_forward</span>
                          </button>
                          <span className="sr-only" aria-live="polite">
                            Showing page {currentPage + 1} of {totalPages}
                          </span>
                        </nav>
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
