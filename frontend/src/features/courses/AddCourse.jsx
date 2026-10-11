import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import Input from '../../components/input/Input';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SlotGrid from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AddCourse = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [grid, setGrid] = useState({}); // { [slotId]: { [dayIndex]: 'selected' | 'empty' } }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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
        setError('');
      } else {
        setError('Could not load the time slots. Please refresh the page.');
      }
    };

    loadTimeSlots();
  }, [currentUser, loading, isLecturer, execute, reloadKey]);

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
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Add A Course</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Register a course and mark the slots when it will be tutored.
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate('/courses')}>
              View All Courses
            </Button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-gutter">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
            {/* Course details — left column */}
            <div className="lg:col-span-4">
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    Course Details
                  </h3>
                  <p className="font-body-sm text-outline mt-1">
                    Fill in the course information below.
                  </p>
                </div>
                <div className="flex-1 space-y-8">
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
                    labelText="Minimum Required Mark"
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
                      Click on the slots when this course will be tutored.
                    </p>
                  </div>
                  <span className="font-body-sm text-on-surface-variant">
                    {selectedSlotCount} selected
                  </span>
                </div>

                <div className="flex-1 min-h-0">
                  <SlotGrid timeSlots={timeSlots} grid={grid} onToggle={toggleSlot} fill />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-gutter flex flex-wrap items-center gap-gutter">
              <ErrorMessage>{error}</ErrorMessage>
              {timeSlots.length === 0 && (
                <Button
                  className="min-w-32"
                  onClick={() => {
                    setError('');
                    setReloadKey((key) => key + 1);
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          {success && (
            <p className="font-body-md text-primary bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm">
              {success}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={() => navigate('/courses')}>Cancel</Button>
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
