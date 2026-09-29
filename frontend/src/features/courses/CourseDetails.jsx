import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
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

const CourseDetails = () => {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [course, setCourse] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [grid, setGrid] = useState({});
  const [error, setError] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const canViewCourses = role === 'lecturer' || role === 'organiser';

  // Only logged-in lecturers and organisers may view this page
  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!canViewCourses) {
      navigate('/tutor-dashboard');
    }
  }, [currentUser, loading, navigate, canViewCourses]);

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

      setCourse(courseResponse.data);
      setTimeSlots(slotsResponse.data);
      setGrid(buildGrid(slotsResponse.data, courseResponse.data.slots));
    };

    loadCourse();
  }, [currentUser, loading, canViewCourses, courseId, execute]);

  if (loading) return null;
  if (!currentUser || !canViewCourses) return null;

  const formatDate = (isoString) =>
    new Date(isoString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <AppLayout role="lecturer" title="Courses">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">
              {course ? `${course.courseCode}` : 'Course'}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {course ? course.courseName : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="min-w-40" onClick={() => navigate('/courses')}>
              Back to Courses
            </Button>
            {course && (
              <Button className="min-w-40" onClick={() => navigate(`/courses/${course.id}/edit`)}>
                Edit Course
              </Button>
            )}
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {isLoading && !course && (
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

        {course && (
          <div className="space-y-gutter">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
              {/* Course details — left column */}
              <div className="lg:col-span-4">
                <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                  <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Course Details
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Core information about this course.
                    </p>
                  </div>
                  <div className="flex-1 space-y-6">
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Added</p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">{formatDate(course.createdAt)}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Lecturer</p>
                      <p className="font-body-md text-on-surface mt-1">
                        {course.lecturer
                          ? `${course.lecturer.firstName} ${course.lecturer.lastName} (${course.lecturer.email})`
                          : 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Minimum Mark</p>
                      <p className="font-body-md text-on-surface mt-1 font-data-mono">{course.minimumMark}</p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Tutors</p>
                      <p className="font-body-md text-on-surface mt-1">
                        <span className="font-semibold font-data-mono">
                          {course.assignedCount}/{course.tutorsRequired}
                        </span>{' '}
                        allocated
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        Accepting Applications
                      </p>
                      <p className="font-body-md text-on-surface mt-1">
                        {course.acceptingApplications ? (
                          <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">
                            Yes - open for tutor applications
                          </span>
                        ) : (
                          <span className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-semibold">
                            No
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                        Allocation Status
                      </p>
                      <p className="font-body-md text-on-surface mt-1">
                        {course.isAllocated ? (
                          <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold">
                            Tutors allocated
                          </span>
                        ) : (
                          <span className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-semibold">
                            No tutors allocated yet
                          </span>
                        )}
                      </p>
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
                        The weekly slots when this course is tutored. Edit them on the edit page.
                      </p>
                    </div>
                    <span className="font-body-sm text-on-surface-variant">{course.slots.length} slots</span>
                  </div>

                  <div className="flex-1 min-h-0">
                    <SlotGrid timeSlots={timeSlots} grid={grid} readOnly label="Tutor" fill />
                  </div>
                </div>
              </div>
            </div>

            {/* Allocated Tutors — full width at bottom */}
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
                Allocated Tutors
              </h2>
              {course.assignedTutors.length === 0 ? (
                <p className="font-body-md text-on-surface-variant py-stack-md">
                  No tutors have been allocated to this course yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                        <th className="py-stack-sm px-stack-md">Tutor</th>
                        <th className="py-stack-sm px-stack-md">Semester</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-variant font-body-md">
                      {course.assignedTutors.map((tutor) => (
                        <tr key={tutor.userId}>
                          <td className="py-stack-sm px-stack-md">
                            <span className="font-semibold text-on-surface">{tutor.tutorName}</span>
                            <p className="font-body-sm text-outline mt-1">{tutor.tutorEmail}</p>
                          </td>
                          <td className="py-stack-sm px-stack-md">{tutor.semester}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="font-body-sm text-outline mt-stack-sm">
                {course.applicationsCount} application{course.applicationsCount === 1 ? '' : 's'} received
              </p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default CourseDetails;
