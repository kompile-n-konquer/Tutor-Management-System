import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import { minutesToLabel } from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

// Event dates live at UTC midnight — format them in UTC so the weekday always
// matches the one the timeslots were derived from
const formatEventDate = (isoString) =>
  new Date(isoString).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const EventRegister = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [register, setRegister] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const isLecturer = role === 'lecturer';

  // Only the course's lecturer marks attendance
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

    const loadRegister = async () => {
      const response = await execute(() => api.get(`/events/${id}/register`));
      if (!response) return;

      if (response.status !== 200) {
        setError(
          response?.data?.message || 'Could not load the register. Please go back and try again.'
        );
        return;
      }

      setRegister(response.data);
      setSelectedIds(response.data.tutors.filter((tutor) => tutor.present).map((tutor) => tutor.id));
      setError('');
    };

    loadRegister();
  }, [currentUser, loading, isLecturer, id, execute]);

  if (loading) return null;
  if (!currentUser || !isLecturer) return null;

  // Auto-save: every tick replaces the register server-side. The flip is
  // optimistic — a failed save reverts the checkbox and surfaces the message.
  const togglePresent = async (tutorId) => {
    const previous = selectedIds;
    const next = previous.includes(tutorId)
      ? previous.filter((current) => current !== tutorId)
      : [...previous, tutorId];
    setSelectedIds(next);

    const response = await execute(() =>
      api.put(`/events/${id}/register`, { presentIds: next })
    );
    if (response?.status !== 200) {
      setSelectedIds(previous);
      setError(response?.data?.message || 'Could not save the register. Please try again.');
    } else {
      setError('');
    }
  };

  const tutors = register?.tutors || [];

  return (
    <AppLayout role={role} title="Events">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">
              {register ? `${register.courseCode} Register` : 'Event Register'}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {register ? `${register.courseName} — ${formatEventDate(register.date)}` : ''}
            </p>
            {register && register.times.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {register.times.map((time, index) => (
                  <span
                    key={index}
                    className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                  >
                    {minutesToLabel(time.startMinute)}-{minutesToLabel(time.endMinute)}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button className="min-w-40" onClick={() => navigate(`/events/${id}`)}>
              Back to Event
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-gutter">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento space-y-gutter">
          <div className="flex flex-wrap items-center justify-between gap-gutter">
            <div>
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                Tutors Allocated
              </h3>
              <p className="font-body-sm text-outline mt-1">
                Tick the tutors who were present at this event — each change saves immediately.
              </p>
            </div>
            <span className="font-body-sm text-on-surface-variant">
              {isLoading && register
                ? 'Saving...'
                : `${selectedIds.length} of ${tutors.length} marked present`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 font-label-caps text-label-caps text-on-surface-variant">
                  <th className="py-stack-sm px-stack-md w-12">Present</th>
                  <th className="py-stack-sm px-stack-md">Full Name</th>
                  <th className="py-stack-sm px-stack-md">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-body-md">
                {tutors.map((tutor) => (
                  <tr key={tutor.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="py-stack-sm px-stack-md">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(tutor.id)}
                        onChange={() => togglePresent(tutor.id)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                        aria-label={`Mark ${tutor.name} present`}
                      />
                    </td>
                    <td className="py-stack-sm px-stack-md font-semibold text-on-surface">
                      {tutor.name}
                    </td>
                    <td className="py-stack-sm px-stack-md text-on-surface-variant">{tutor.email}</td>
                  </tr>
                ))}
                {register && tutors.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="py-stack-lg text-center text-on-surface-variant font-body-md"
                    >
                      No tutors have been allocated to this course yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default EventRegister;
