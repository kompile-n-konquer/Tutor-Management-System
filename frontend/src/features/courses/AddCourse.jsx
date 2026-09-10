import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import Input from '../../components/input/Input';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts minutes since midnight (480) into a time label ("08:00")
const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const AddCourse = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [grid, setGrid] = useState({}); // { [slotId]: { [dayIndex]: 'selected' | 'empty' } }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [data, setData] = useState({
    courseCode: '',
    courseName: '',
    minimumMark: '',
    tutorsRequired: '',
  });

  const isLecturer = currentUser?.role?.toLowerCase() === 'lecturer';

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

    const loadTimeSlots = async () => {
      const response = await execute(() => api.get('/courses/time-slots'));
      if (response && response.status === 200) {
        const slots = response.data;

        const newGrid = {};
        slots.forEach((slot) => {
          newGrid[slot.id] = { 0: 'empty', 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' };
        });

        setTimeSlots(slots);
        setGrid(newGrid);
      } else {
        setError('Could not load the time slots. Please refresh the page.');
      }
    };

    loadTimeSlots();
  }, [currentUser, loading, isLecturer, execute]);

  if (loading) return null;
  if (!currentUser || !isLecturer) return null;

  const handleChange = (event, name) => {
    setError('');
    setSuccess('');
    setData((prevData) => ({ ...prevData, [name]: event.target.value }));
  };

  const toggleSlot = (slotId, dayIndex) => {
    setError('');
    setSuccess('');
    setGrid((prev) => {
      const current = prev[slotId][dayIndex];
      const next = current === 'selected' ? 'empty' : 'selected';
      return {
        ...prev,
        [slotId]: {
          ...prev[slotId],
          [dayIndex]: next,
        },
      };
    });
  };

  const selectedSlotCount = timeSlots.reduce((count, slot) => {
    return count + Object.values(grid[slot.id] || {}).filter((status) => status === 'selected').length;
  }, 0);

  const disableBtn =
    !data.courseCode ||
    !data.courseName ||
    !data.minimumMark ||
    !data.tutorsRequired ||
    selectedSlotCount === 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const minimumMark = Number(data.minimumMark);
    if (Number.isNaN(minimumMark) || minimumMark < 0 || minimumMark > 100) {
      setError('Minimum Mark must be a number between 0 and 100.');
      return;
    }

    const tutorsRequired = Number(data.tutorsRequired);
    if (!Number.isInteger(tutorsRequired) || tutorsRequired < 1) {
      setError('Tutors Required must be a whole number of at least 1.');
      return;
    }

    const slots = [];
    timeSlots.forEach((slot) => {
      Object.entries(grid[slot.id]).forEach(([dayIndex, status]) => {
        if (status === 'selected') {
          slots.push({ dayOfWeek: Number(dayIndex), timeSlotId: slot.id });
        }
      });
    });

    const response = await execute(() =>
      api.post('/courses', {
        courseCode: data.courseCode.trim(),
        courseName: data.courseName.trim(),
        minimumMark,
        tutorsRequired,
        slots,
      })
    );

    if (response && response.status === 201) {
      setSuccess(`Course "${response.data.courseCode}" was created successfully.`);
      setData({ courseCode: '', courseName: '', minimumMark: '', tutorsRequired: '' });
      setGrid((prev) => {
        const cleared = {};
        Object.keys(prev).forEach((slotId) => {
          cleared[slotId] = { 0: 'empty', 1: 'empty', 2: 'empty', 3: 'empty', 4: 'empty' };
        });
        return cleared;
      });
    } else {
      setError(response?.data?.message || 'Could not create the course. Please try again.');
    }
  };

  return (
    <AppLayout role="lecturer" title="Courses">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Add a Course</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Register a course and mark the slots when it will be tutored.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-gutter max-w-4xl">
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
              <Input
                labelText="Course Code"
                icon="code_blocks"
                placeholder="COMS3005"
                value={data.courseCode}
                onChange={(e) => handleChange(e, 'courseCode')}
              />
              <Input
                labelText="Course Name"
                icon="menu_book"
                placeholder="Advanced Algorithms"
                value={data.courseName}
                onChange={(e) => handleChange(e, 'courseName')}
              />
              <Input
                labelText="Minimum Mark"
                icon="grade"
                type="number"
                placeholder="70"
                value={data.minimumMark}
                onChange={(e) => handleChange(e, 'minimumMark')}
              />
              <Input
                labelText="Tutors Required"
                icon="groups"
                type="number"
                placeholder="1"
                value={data.tutorsRequired}
                onChange={(e) => handleChange(e, 'tutorsRequired')}
              />
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
              <div>
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                  Tutoring Slots
                </h3>
                <p className="font-body-sm text-outline mt-1">
                  Click on the slots when this course will be tutored.
                </p>
              </div>
              <span className="font-body-sm text-on-surface-variant">
                {selectedSlotCount} selected
              </span>
            </div>

            <div className="overflow-x-auto calendar-scroll">
              <div className="min-w-[600px] grid grid-cols-6 gap-px bg-outline-variant/30">
                <div className="bg-surface-container-lowest p-2" />
                {DAYS.map((d) => (
                  <div
                    key={d}
                    className="bg-surface-container-lowest p-2 text-center font-label-caps text-label-caps text-on-surface-variant"
                  >
                    {d}
                  </div>
                ))}

                {timeSlots.map((slot) => (
                  <div key={slot.id} className="contents">
                    <div className="bg-surface-container-lowest p-2 text-right font-data-mono text-body-sm text-outline border-b border-outline-variant/20">
                      {minutesToLabel(slot.startMinute)}-{minutesToLabel(slot.endMinute)}
                    </div>
                    {DAYS.map((day, dayIndex) => {
                      const status = grid[slot.id]?.[dayIndex] || 'empty';
                      return (
                        <div
                          key={`${slot.id}-${day}`}
                          onClick={() => toggleSlot(slot.id, dayIndex)}
                          className={`p-2 border-b border-outline-variant/20 relative cursor-pointer transition-colors ${
                            status === 'selected' ? 'bg-primary/5 hover:bg-primary/10' : 'bg-surface-container-lowest hover:bg-surface-container-low'
                          }`}
                        >
                          <div className="h-8">
                            {status === 'selected' && (
                              <div className="absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary cursor-pointer">
                                Tutor
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {success && (
            <p className="font-body-md text-primary bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm">
              {success}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={disableBtn} loading={isLoading} className="min-w-40">
              Add Course
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
};

export default AddCourse;
