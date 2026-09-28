import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  DRAFT: 'bg-surface-variant text-on-surface-variant',
  SUBMITTED: 'bg-trust-blue/10 text-trust-blue',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-error/10 text-error',
};

const Timesheets = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [timesheets, setTimesheets] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const role = currentUser?.role?.toLowerCase();
  const isTutor = role === 'tutor' || role === 'student';
  const isLecturer = role === 'lecturer' || role === 'organiser' || role === 'admin';

  const loadTimesheets = useCallback(async () => {
    if (!currentUser) return;
    const res = await execute(() => (isTutor ? api.get('/timesheets') : api.get('/timesheets/pending-review')));
    if (res && res.status === 200) setTimesheets(res.data);
    setLoaded(true);
  }, [currentUser, execute, isTutor]);

  useEffect(() => {
    if (loading) return;
    if (!currentUser) navigate('/login');
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    if (loading || !currentUser) return;
    loadTimesheets();
  }, [currentUser, loading, loadTimesheets]);

  const handleCreate = async () => {
    const res = await execute(() => api.post('/timesheets'));
    if (res && res.status === 201) {
      navigate(`/timesheets/${res.data.id}`);
    }
  };

  if (loading) return null;
  if (!currentUser) return null;

  const formatDate = (iso) => new Date(iso).toLocaleDateString();

  console.log(timesheets);
  return (
    <AppLayout role={role} title="Timesheets">
      <div className="p-gutter md:p-margin-page space-y-gutter">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Timesheets</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {isTutor
                ? 'Track your tutoring hours and submit them for approval.'
                : 'Review and sign off submitted timesheets.'}
            </p>
          </div>
          <div>
            {isTutor && (
              <Button className="min-w-40" onClick={handleCreate}>
                Create Timesheet
              </Button>
            )}
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
          {isLoading && !loaded ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading timesheets...</p>
          ) : timesheets.length === 0 ? (
            <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
              {isTutor
                ? 'No timesheets yet. Click "Create Timesheet" to start one.'
                : 'No timesheets are awaiting your review.'}
            </p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                  <th className="py-stack-sm px-stack-md">Name</th>
                  {isLecturer && <th className="py-stack-sm px-stack-md">Tutor</th>}
                  {!isLecturer && <th className="py-stack-sm px-stack-md">Created</th>}
                  {!isLecturer && <th className="py-stack-sm px-stack-md">Last Saved</th>}
                  <th className="py-stack-sm px-stack-md">Total Hours</th>
                  <th className="py-stack-sm px-stack-md">Status</th>
                  <th className="py-stack-sm px-stack-md"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-variant font-body-md">
                {timesheets.map((timesheet) => {
                  const editable = timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';
                  return (
                    <tr key={timesheet.id}>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">{timesheet.name}</td>
                      {isLecturer && (
                        <td className="py-stack-sm px-stack-md">
                          <span className="font-semibold text-on-surface">{timesheet.tutorName}</span>
                          <span className="text-on-surface-variant text-xs ml-1">{timesheet.tutorEmail}</span>
                        </td>
                      )}
                      {!isLecturer && (
                        <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                          {formatDate(timesheet.createdAt)}
                        </td>
                      )}
                      {!isLecturer && (
                        <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                          {formatDate(timesheet.updatedAt)}
                        </td>
                      )}
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {(timesheet.entries || []).reduce((sum, e) => sum + Number(e.duration || 0), 0)}
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold font-data-mono ${STATUS_STYLES[timesheet.status] || ''}`}
                        >
                          {timesheet.status}
                        </span>
                      </td>
                      <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        <Button
                          className="min-w-24 max-h-8 text-[11px]"
                          onClick={() =>
                            navigate(editable ? `/timesheets/${timesheet.id}` : `/timesheets/${timesheet.id}/details`)
                          }
                        >
                          {editable ? 'Continue Editing' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default Timesheets;
