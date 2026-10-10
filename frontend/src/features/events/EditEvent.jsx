import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';
import EventForm from './EventForm';

const EditEvent = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [event, setEvent] = useState(null);
  const [courses, setCourses] = useState([]); // lecturer's own courses with their slots
  const [timeSlots, setTimeSlots] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const isLecturer = currentUser?.role?.toLowerCase() === 'lecturer';

  // Only logged-in lecturers may edit events; the backend additionally limits
  // editing to the lecturer who created the event's course
  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!isLecturer) {
      navigate('/tutor-dashboard');
    }
  }, [currentUser, loading, navigate, isLecturer]);

  useEffect(() => {
    if (loading || !currentUser || !isLecturer) return;

    const loadEvent = async () => {
      const [eventResponse, coursesResponse, slotsResponse] = await execute(() =>
        Promise.all([
          api.get(`/events/${id}`),
          api.get('/events/my-courses'),
          api.get('/courses/time-slots'),
        ])
      );

      if (!eventResponse || !coursesResponse || !slotsResponse) return;

      if (eventResponse.status !== 200) {
        setError(eventResponse?.data?.message || 'Could not load the event. Please go back and try again.');
        return;
      }
      if (coursesResponse.status !== 200) {
        setError(coursesResponse?.data?.message || 'Could not load your courses. Please refresh the page.');
        return;
      }
      if (slotsResponse.status !== 200) {
        setError('Could not load the time slots. Please refresh the page.');
        return;
      }

      setEvent(eventResponse.data);
      setCourses(coursesResponse.data);
      setTimeSlots(slotsResponse.data);
      setError('');
    };

    loadEvent();
  }, [currentUser, loading, isLecturer, id, execute, reloadKey]);

  if (loading) return null;
  if (!currentUser || !isLecturer) return null;

  const handleUpdate = async ({ courseId, date, description }) => {
    const response = await execute(() => api.put(`/events/${id}`, { courseId, date, description }));

    if (response && response.status === 200) {
      setEvent(response.data);
      setSuccess('Event updated successfully.');
      return { ok: true };
    }
    return {
      ok: false,
      message: response?.data?.message || 'Could not update the event. Please try again.',
    };
  };

  return (
    <AppLayout role="lecturer" title="Events">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Edit Event</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {event ? `${event.courseCode} - ${event.courseName}` : 'Update the course, date and description.'}
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate(`/events/${id}`)}>
              Back to Event
            </Button>
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
        {success && (
          <p className="font-body-md text-primary bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm mb-gutter">
            {success}
          </p>
        )}

        {isLoading && !event && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter" aria-hidden="true">
            <div className="lg:col-span-4 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-stack-lg">
              <div className="h-4 w-28 rounded bg-surface-container-high" />
              <div className="h-11 rounded bg-surface-container-high/60" />
              <div className="h-11 rounded bg-surface-container-high/60" />
              <div className="h-11 rounded bg-surface-container-high/60" />
            </div>
            <div className="lg:col-span-8 animate-pulse bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-stack-md">
              <div className="h-4 w-32 rounded bg-surface-container-high" />
              <div className="h-64 rounded bg-surface-container-high/60" />
            </div>
          </div>
        )}

        {event && (
          <EventForm
            courses={courses}
            timeSlots={timeSlots}
            event={event}
            onSubmit={handleUpdate}
            onCancel={() => navigate(`/events/${id}`)}
            submitLabel="Save Changes"
            isSubmitting={isLoading}
          />
        )}
      </div>
    </AppLayout>
  );
};

export default EditEvent;
