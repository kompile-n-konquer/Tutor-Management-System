import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const ViewAllCourses = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [courses, setCourses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const canViewCourses = role === 'lecturer' || role === 'organiser';

  useEffect(() => {
    if (loading || !currentUser || !canViewCourses) return;

    const loadCourses = async () => {
      const response = await execute(() => api.get('/courses'));
      if (response && response.status === 200) {
        setCourses(response.data);
      } else {
        setError(response?.data?.message || 'Could not load the courses. Please refresh the page.');
      }
      setLoaded(true);
    };

    loadCourses();
  }, [currentUser, loading, canViewCourses, execute]);

  if (loading) return null;
  if (!currentUser || !canViewCourses) return null;

  // A course is eligible for the application process when it has no allocated
  // tutors yet and is not already accepting applications
  const isEligible = (course) => !course.isAllocated && !course.acceptingApplications;
  const eligibleCourses = courses.filter(isEligible);
  const allEligibleSelected =
    eligibleCourses.length > 0 && eligibleCourses.every((course) => selectedIds.includes(course.id));

  const toggleSelection = (courseId) => {
    setError('');
    setSuccess('');
    setSelectedIds((prev) =>
      prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
    );
  };

  const toggleAll = () => {
    setError('');
    setSuccess('');
    setSelectedIds(allEligibleSelected ? [] : eligibleCourses.map((course) => course.id));
  };

  const reloadCourses = async () => {
    const response = await execute(() => api.get('/courses'));
    if (response && response.status === 200) {
      setCourses(response.data);
    }
  };

  const handleStartApplicationProcess = async () => {
    setError('');
    setSuccess('');

    if (selectedIds.length === 0) return;

    const response = await execute(() => api.put('/courses/open-applications', { courseIds: selectedIds }));

    if (response && response.status === 200) {
      const { updatedCount, skippedCount } = response.data;
      if (updatedCount > 0) {
        setSuccess(
          `Application process started for ${updatedCount} course${updatedCount === 1 ? '' : 's'}${
            skippedCount > 0 ? `, ${skippedCount} skipped (already allocated or accepting applications)` : ''
          }.`
        );
      } else {
        setError('No courses were updated. Selected courses must have no allocated tutors and not be accepting applications already.');
      }
      setSelectedIds([]);
      await reloadCourses();
    } else {
      setError(response?.data?.message || 'Could not start the application process. Please try again.');
    }
  };

  const formatDate = (isoString) => new Date(isoString).toLocaleDateString();

  return (
    <AppLayout role="lecturer" title="Courses">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Courses</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {role === 'lecturer'
                ? 'The courses you created and their tutoring status. Click a course to see its details.'
                : 'All courses and their tutoring status. Click a course to see its details.'}
            </p>
          </div>
          <div>
            <Button className="min-w-40" onClick={() => navigate('/courses/add')}>
              Add Course
            </Button>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {success && (
          <p className="font-body-md text-primary bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm mb-gutter">
            {success}
          </p>
        )}

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading courses...</p>
          ) : courses.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              {role === 'lecturer'
                ? "You haven't created any courses yet."
                : 'No courses have been added yet.'}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-gutter mb-stack-md pb-stack-sm border-b border-surface-variant">
                <p className="font-body-sm text-on-surface-variant">
                  Select courses without allocated tutors to start their application process.
                </p>
                <div>
                  <Button
                    onClick={handleStartApplicationProcess}
                    disabled={selectedIds.length === 0}
                    loading={isLoading}
                    className="min-w-40"
                  >
                    Start Application Process ({selectedIds.length})
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                      <th className="py-stack-sm px-stack-md">
                        <input
                          type="checkbox"
                          checked={allEligibleSelected}
                          onChange={toggleAll}
                          disabled={eligibleCourses.length === 0}
                          title="Select all courses that can start an application process"
                          className="cursor-pointer"
                        />
                      </th>
                      <th className="py-stack-sm px-stack-md">Course</th>
                      <th className="py-stack-sm px-stack-md">Added</th>
                      <th className="py-stack-sm px-stack-md">Lecturer</th>
                      <th className="py-stack-sm px-stack-md">Tutors</th>
                      <th className="py-stack-sm px-stack-md">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-variant font-body-md">
                    {courses.map((course) => {
                      const eligible = isEligible(course);
                      return (
                        <tr
                          key={course.id}
                          onClick={() => navigate(`/courses/${course.id}`)}
                          className="cursor-pointer hover:bg-surface-container-low transition-colors"
                        >
                          <td className="py-stack-sm px-stack-md" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(course.id)}
                              onChange={() => toggleSelection(course.id)}
                              disabled={!eligible}
                              title={
                                eligible
                                  ? 'Select to start the application process'
                                  : 'Not eligible: tutors are allocated or applications are already open'
                              }
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <span className="font-bold text-primary">{course.courseCode}</span>
                            <span className="text-on-surface-variant"> - {course.courseName}</span>
                            <p className="font-body-sm text-outline mt-1">
                              Min mark {course.minimumMark} · {course.slotsCount} tutoring slot
                              {course.slotsCount === 1 ? '' : 's'}
                            </p>
                          </td>
                          <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                            {formatDate(course.createdAt)}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {course.lecturer
                              ? `${course.lecturer.firstName} ${course.lecturer.lastName}`
                              : 'Unknown'}
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            <span className="font-semibold text-on-surface">
                              {course.assignedTutors}/{course.tutorsRequired}
                            </span>
                          </td>
                          <td className="py-stack-sm px-stack-md">
                            {course.acceptingApplications ? (
                              <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">
                                Accepting Applications
                              </span>
                            ) : course.isAllocated ? (
                              <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-semibold">
                                Tutors Allocated
                              </span>
                            ) : (
                              <span className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-semibold">
                                Needs Tutors
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ViewAllCourses;
