import { useEffect, useState } from 'react';
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

const Events = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const canViewEvents = role === 'tutor' || role === 'lecturer' || role === 'organiser' || role === 'admin';
  const isLecturer = role === 'lecturer';

  useEffect(() => {
    if (loading || !currentUser || !canViewEvents) return;

    const loadEvents = async () => {
      const response = await execute(() => api.get('/events'));
      if (response && response.status === 200) {
        setEvents(response.data);
      } else if (response) {
        setError(response?.data?.message || 'Could not load the events. Please refresh the page.');
      }
      setLoaded(true);
    };

    loadEvents();
  }, [currentUser, loading, canViewEvents, execute]);

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
                ? 'Events for the tutoring timeslots of your courses. Click an event to see its details.'
                : 'Events scheduled for the tutoring timeslots of your courses. Click an event to see its details.'}
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

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading events...</p>
          ) : events.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">{emptyMessage}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Course</th>
                    <th className="py-stack-sm px-stack-md">Date</th>
                    <th className="py-stack-sm px-stack-md">Time</th>
                    <th className="py-stack-sm px-stack-md">Description</th>
                    <th className="py-stack-sm px-stack-md">Lecturer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      onClick={() => navigate(`/events/${event.id}`)}
                      className="cursor-pointer hover:bg-surface-container-low transition-colors"
                    >
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{event.courseCode}</span>
                        <span className="text-on-surface-variant"> - {event.courseName}</span>
                      </td>
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
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Events;
