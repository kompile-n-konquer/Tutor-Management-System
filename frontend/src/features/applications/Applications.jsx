import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { DAYS, minutesToLabel } from '../../components/slot-grid/SlotGrid';

// Turns an opportunity's slots into compact "Mon 08:00-08:45" badges
const formatSlot = (slot) => `${DAYS[slot.dayOfWeek]} ${minutesToLabel(slot.startMinute)}-${minutesToLabel(slot.endMinute)}`;

const STATUS_BADGES = {
  PENDING: 'bg-trust-blue/10 text-trust-blue',
  APPROVED: 'bg-primary/10 text-primary',
  REJECTED: 'bg-error/10 text-error',
};

const Applications = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [opportunities, setOpportunities] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const canApply = role === 'student' || role === 'tutor';

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/login');
    } else if (!canApply) {
      navigate(role === 'lecturer' || role === 'organiser' ? '/courses' : '/tutor-dashboard');
    }
  }, [currentUser, loading, navigate, canApply, role]);

  useEffect(() => {
    if (loading || !currentUser || !canApply) return;

    const loadApplications = async () => {
      const [opportunitiesResponse, mineResponse] = await execute(() =>
        Promise.all([api.get('/applications'), api.get('/applications/mine')])
      );

      if (!opportunitiesResponse || !mineResponse) return;

      if (opportunitiesResponse.status !== 200) {
        setError(opportunitiesResponse?.data?.message || 'Could not load the opportunities. Please refresh the page.');
      } else {
        setOpportunities(opportunitiesResponse.data);
      }
      if (mineResponse.status === 200) {
        setMyApplications(mineResponse.data);
      }
      setLoaded(true);
    };

    loadApplications();
  }, [currentUser, loading, canApply, execute]);

  if (loading) return null;
  if (!currentUser || !canApply) return null;

  const formatDate = (isoString) => new Date(isoString).toLocaleDateString();

  return (
    <AppLayout role="student" title="Applications">
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Applications</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Tutoring opportunities that are open for applications. Click one to see the details and apply.
            </p>
          </div>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {/* Availability note — opportunities are already filtered by the student's timetable */}
        <div className="bg-primary/5 border border-primary/30 rounded-xl px-stack-md py-stack-sm mb-gutter flex flex-wrap items-center gap-gutter">
          <span className="material-symbols-outlined text-primary">schedule</span>
          <p className="font-body-md text-on-surface flex-1 min-w-fit">
            You only see opportunities whose tutoring slots fit your weekly availability.
            <Link to="/timetable/edit" className="text-primary font-semibold underline ml-1">
              Update your timetable
            </Link>{' '}
            to see more.
          </p>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md mb-gutter">
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading opportunities...</p>
          ) : opportunities.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              No opportunities are open for your availability right now. Check back later or update your timetable.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Opportunity</th>
                    <th className="py-stack-sm px-stack-md">Tutoring Slots</th>
                    <th className="py-stack-sm px-stack-md">Added</th>
                    <th className="py-stack-sm px-stack-md">Lecturer</th>
                    <th className="py-stack-sm px-stack-md">Tutors</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                    <th className="py-stack-sm px-stack-md"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {opportunities.map((opportunity) => (
                    <tr key={opportunity.id}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{opportunity.courseCode}</span>
                        <span className="text-on-surface-variant"> - {opportunity.courseName}</span>
                        <p className="font-body-sm text-outline mt-1">Min mark {opportunity.minimumMark}</p>
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <div className="flex flex-wrap gap-1">
                          {opportunity.slots.map((slot, index) => (
                            <span
                              key={`${slot.dayOfWeek}-${slot.timeSlotId}-${index}`}
                              className="bg-surface-variant text-on-surface-variant px-2 py-1 rounded text-xs font-data-mono"
                            >
                              {formatSlot(slot)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(opportunity.createdAt)}
                      </td>
                      <td className="py-stack-sm px-stack-md">{opportunity.lecturer || 'Unknown'}</td>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-semibold text-on-surface font-data-mono">
                          {opportunity.assignedTutors}/{opportunity.tutorsRequired}
                        </span>
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">
                          Open
                        </span>
                      </td>
                      <td className="py-stack-sm px-stack-md" onClick={(e) => e.stopPropagation()}>
                        <Button className="min-w-32" onClick={() => navigate(`/applications/${opportunity.id}`)}>
                          View & Apply
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* My Applications — everything the student has submitted and its review status */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
            My Applications
          </h2>
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-md text-center">Loading your applications...</p>
          ) : myApplications.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-md">
              You have not applied for any tutoring opportunities yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                    <th className="py-stack-sm px-stack-md">Course</th>
                    <th className="py-stack-sm px-stack-md">Your Mark</th>
                    <th className="py-stack-sm px-stack-md">Applied</th>
                    <th className="py-stack-sm px-stack-md">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-variant font-body-md">
                  {myApplications.map((application) => (
                    <tr key={application.id}>
                      <td className="py-stack-sm px-stack-md">
                        <span className="font-bold text-primary">{application.courseCode}</span>
                        <span className="text-on-surface-variant"> - {application.courseName}</span>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono">{application.courseMark}</td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(application.appliedAt)}
                      </td>
                      <td className="py-stack-sm px-stack-md">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            STATUS_BADGES[application.status] || 'bg-surface-variant text-on-surface-variant'
                          }`}
                        >
                          {application.status}
                        </span>
                      </td>
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

export default Applications;
