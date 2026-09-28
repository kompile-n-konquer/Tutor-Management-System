import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import Input from '../../components/input/Input';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import SlotGrid from '../../components/slot-grid/SlotGrid';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';

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

const EditCourse = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [course, setCourse] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [grid, setGrid] = useState({});
  const [savedGrid, setSavedGrid] = useState({});
  const [data, setData] = useState({
    courseCode: '',
    courseName: '',
    minimumMark: '',
    tutorsRequired: '',
  });
  const [savedData, setSavedData] = useState({
    courseCode: '',
    courseName: '',
    minimumMark: '',
    tutorsRequired: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const canViewCourses = role === 'lecturer' || role === 'organiser';

  useEffect(() => {
    if (loading || !currentUser || !canViewCourses) return;

    const loadCourse = async () => {
      const [courseResponse, slotsResponse] = await execute(() =>
        Promise.all([api.get(`/courses/${courseId}`), api.get('/courses/time-slots')])
      );

      if (!courseResponse || !slotsResponse) return;

      if (courseResponse.status !== 200) {
        setError(courseResponse?.data?.message || 'Could not load the course. Please go back and try again.');
        return;
      }
      if (slotsResponse.status !== 200) {
        setError('Could not load the time slots. Please refresh the page.');
        return;
      }

      const loadedGrid = buildGrid(slotsResponse.data, courseResponse.data.slots);
      const loadedData = {
        courseCode: courseResponse.data.courseCode,
        courseName: courseResponse.data.courseName,
        minimumMark: String(courseResponse.data.minimumMark),
        tutorsRequired: String(courseResponse.data.tutorsRequired),
      };
      setCourse(courseResponse.data);
      setTimeSlots(slotsResponse.data);
      setGrid(loadedGrid);
      setSavedGrid(loadedGrid);
      setData(loadedData);
      setSavedData(loadedData);
    };

    loadCourse();
  }, [currentUser, loading, canViewCourses, courseId, execute]);

  if (loading) return null;
  if (!currentUser || !canViewCourses) return null;

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

  const handleChange = (event, name) => {
    setError('');
    setSuccess('');
    setData((prevData) => ({ ...prevData, [name]: event.target.value }));
  };

  const selectedSlotCount = timeSlots.reduce((count, slot) => {
    return count + Object.values(grid[slot.id] || {}).filter((status) => status === 'selected').length;
  }, 0);

  const hasChanges =
    JSON.stringify(grid) !== JSON.stringify(savedGrid) || JSON.stringify(data) !== JSON.stringify(savedData);
  const disableBtn = selectedSlotCount === 0 || !hasChanges;

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
      api.put(`/courses/${courseId}`, {
        courseCode: data.courseCode.trim(),
        courseName: data.courseName.trim(),
        minimumMark,
        tutorsRequired,
        slots,
      })
    );

    if (response && response.status === 200) {
      setSavedData(data);
      setSavedGrid(grid);
      setCourse((prev) => ({ ...prev, ...response.data }));
      setSuccess('Course updated successfully.');
    } else {
      setError(response?.data?.message || 'Could not update the course. Please try again.');
    }
  };

  return (
    <AppLayout role="lecturer" title="Courses">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">
              {course ? `Edit ${course.courseCode}` : 'Edit Course'}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {course ? course.courseName : 'Update the course details and its tutoring slots.'}
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate(`/courses/${courseId}`)}>
              Back to Course
            </Button>
          </div>
        </div>

        {isLoading && !course && (
          <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading course...</p>
        )}

        {course && (
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
                      Update the course information below.
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
                    <span className="font-body-sm text-on-surface-variant">{selectedSlotCount} selected</span>
                  </div>

                  <div className="flex-1 min-h-0">
                    <SlotGrid timeSlots={timeSlots} grid={grid} onToggle={toggleSlot} fill />
                  </div>
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
              <Button onClick={() => navigate(`/courses/${courseId}`)}>Cancel</Button>
              <Button type="submit" disabled={disableBtn} loading={isLoading} className="min-w-40">
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
};

export default EditCourse;
