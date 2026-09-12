import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import api from '../../utils/axiosInstance';
import useAsync from '../../hooks/useAsync';
import { useAuth } from '../context/AuthContext';

const STATUS_STYLES = {
  DRAFT:     'bg-surface-variant text-on-surface-variant',
  SUBMITTED: 'bg-trust-blue/10 text-trust-blue',
  APPROVED:  'bg-primary/10 text-primary',
  REJECTED:  'bg-error/10 text-error',
};

const formatHours = (h) => `${Number(h).toFixed(1)} hrs`;

const Timesheets = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [myTimesheets, setMyTimesheets] = useState([]);
  const [pendingReview, setPendingReview] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [rejectionModal, setRejectionModal] = useState(null); // { timesheetId, reason }
  const [rejectionReason, setRejectionReason] = useState('');

  const role = currentUser?.role?.toLowerCase();
  const isTutor = role === 'tutor' || role === 'student';
  const isLecturer = role === 'lecturer' || role === 'organiser' || role === 'admin';

  const loadTimesheets = useCallback(async () => {
    if (!currentUser) return;

    const requests = [];
    if (isTutor) requests.push(api.get('/timesheets'));
    else requests.push(Promise.resolve(null));

    if (isLecturer) requests.push(api.get('/timesheets/pending-review'));
    else requests.push(Promise.resolve(null));

    const [myRes, pendingRes] = await execute(() => Promise.all(requests));

    if (myRes && myRes.status === 200) setMyTimesheets(myRes.data);
    if (pendingRes && pendingRes.status === 200) setPendingReview(pendingRes.data);
    setLoaded(true);
  }, [currentUser, execute, isTutor, isLecturer]);

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

  const handleSubmit = async (id) => {
    const res = await execute(() => api.post(`/timesheets/${id}/submit`));
    if (res && res.status === 200) {
      loadTimesheets();
    } else {
      setError(res?.data?.message || 'Could not submit timesheet');
    }
  };

  const handleDelete = async (id) => {
    const res = await execute(() => api.delete(`/timesheets/${id}`));
    if (res && res.status === 200) {
      setMyTimesheets((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleApproveEntry = async (timesheetId, entryId) => {
    const res = await execute(() => api.put(`/timesheets/${timesheetId}/entries/${entryId}/approve`));
    if (res && res.status === 200) {
      loadTimesheets();
    }
  };

  const handleRejectTimesheet = async (timesheetId) => {
    if (!rejectionReason.trim()) {
      setError('A rejection reason is required');
      return;
    }
    const res = await execute(() => api.put(`/timesheets/${timesheetId}/reject`, { reason: rejectionReason }));
    if (res && res.status === 200) {
      setRejectionModal(null);
      setRejectionReason('');
      loadTimesheets();
    } else {
      setError(res?.data?.message || 'Could not reject timesheet');
    }
  };

  if (loading) return null;
  if (!currentUser) return null;

  const formatDate = (iso) => new Date(iso).toLocaleDateString();

  return (
    <AppLayout role={role} title="Timesheets">
      <div className="p-gutter md:p-margin-page space-y-gutter">
        <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
          <div>
            <h2 className="font-display text-display text-primary">Timesheets</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {isTutor ? 'Track your tutoring hours and submit them for approval.' : 'Review and sign off submitted timesheets.'}
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

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {/* Tutor view: My Timesheets */}
        {isTutor && (
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
              My Timesheets
            </h3>
            {isLoading && !loaded ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading timesheets...</p>
            ) : myTimesheets.length === 0 ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                No timesheets yet. Create one to start logging your tutoring hours.
              </p>
            ) : (
              <div className="space-y-stack-sm">
                {myTimesheets.map((timesheet) => (
                  <div
                    key={timesheet.id}
                    className="p-stack-md border border-surface-variant rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-stack-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-stack-sm mb-1">
                          <span className={`px-2 py-1 rounded text-xs font-semibold font-data-mono ${STATUS_STYLES[timesheet.status] || ''}`}>
                            {timesheet.status}
                          </span>
                          <span className="font-data-mono text-xs text-on-surface-variant">
                            {formatHours(timesheet.totalHours)} total
                          </span>
                        </div>
                        {timesheet.rejectionReason && (
                          <p className="text-error text-sm mt-1">
                            <span className="font-semibold">Rejection reason:</span> {timesheet.rejectionReason}
                          </p>
                        )}
                        {timesheet.entries.length > 0 && (
                          <p className="font-body-sm text-on-surface-variant mt-1">
                            {timesheet.entries.length} {timesheet.entries.length === 1 ? 'entry' : 'entries'}
                            {timesheet.submittedAt && ` \u00B7 Submitted ${formatDate(timesheet.submittedAt)}`}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {(timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED') && (
                          <>
                            <Button className="min-w-24" onClick={() => navigate(`/timesheets/${timesheet.id}`)}>
                              {timesheet.status === 'REJECTED' ? 'Edit & Resubmit' : 'Continue Editing'}
                            </Button>
                            {timesheet.status === 'DRAFT' && (
                              <button
                                onClick={() => handleDelete(timesheet.id)}
                                className="text-error hover:underline text-sm px-2"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                        {(timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED') && timesheet.entries.length > 0 && (
                          <Button
                            className="min-w-24 !py-2 text-sm bg-trust-blue text-white"
                            onClick={() => handleSubmit(timesheet.id)}
                          >
                            Submit
                          </Button>
                        )}
                        {timesheet.status === 'SUBMITTED' && (
                          <span className="text-trust-blue text-sm font-semibold px-2 py-2">Awaiting review</span>
                        )}
                        {timesheet.status === 'APPROVED' && (
                          <span className="text-primary text-sm font-semibold px-2 py-2">Approved</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lecturer view: Pending Review */}
        {isLecturer && (
          <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">
              Pending Review
            </h3>
            {isLoading && !loaded ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">Loading timesheets...</p>
            ) : pendingReview.length === 0 ? (
              <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
                No timesheets are awaiting your review.
              </p>
            ) : (
              <div className="space-y-gutter">
                {pendingReview.map((timesheet) => (
                  <div
                    key={timesheet.id}
                    className="p-stack-md border border-surface-variant rounded-lg bg-surface-container-low"
                  >
                    <div className="flex flex-wrap justify-between items-start gap-stack-sm mb-stack-sm">
                      <div>
                        <p className="font-body-md font-bold text-on-surface">
                          {timesheet.tutorName}
                          <span className="font-normal text-on-surface-variant ml-2">{timesheet.tutorEmail}</span>
                        </p>
                        <p className="font-data-mono text-xs text-on-surface-variant mt-1">
                          {formatHours(timesheet.totalHours)} total \u00B7 {timesheet.entries.length} entries \u00B7 Submitted {formatDate(timesheet.submittedAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => { setRejectionModal(timesheet.id); setRejectionReason(''); }}
                        className="text-error hover:underline text-sm font-semibold px-2 py-1"
                      >
                        Reject All
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Course</th>
                            <th className="py-2 px-3">Task</th>
                            <th className="py-2 px-3">Hours</th>
                            <th className="py-2 px-3">Supervisor</th>
                            <th className="py-2 px-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-variant font-body-md">
                          {timesheet.entries.map((entry) => {
                            const isMyEntry = entry.supervisorId === currentUser.id;
                            return (
                              <tr key={entry.id}>
                                <td className="py-2 px-3 font-data-mono text-sm">{formatDate(entry.workDate)}</td>
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-primary">{entry.courseCode}</span>
                                  <span className="text-on-surface-variant"> - {entry.courseName}</span>
                                </td>
                                <td className="py-2 px-3 capitalize">{entry.description}</td>
                                <td className="py-2 px-3 font-data-mono">{entry.duration}</td>
                                <td className="py-2 px-3">{entry.supervisorName}</td>
                                <td className="py-2 px-3">
                                  {entry.status === 'APPROVED' ? (
                                    <span className="text-primary text-sm font-semibold">Approved</span>
                                  ) : entry.status === 'REJECTED' ? (
                                    <span className="text-error text-sm font-semibold">Rejected</span>
                                  ) : isMyEntry ? (
                                    <button
                                      onClick={() => handleApproveEntry(timesheet.id, entry.id)}
                                      className="bg-primary text-white px-3 py-1 rounded text-sm font-semibold hover:opacity-90"
                                    >
                                      Approve
                                    </button>
                                  ) : (
                                    <span className="text-on-surface-variant text-sm">Pending</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rejection reason modal */}
        {rejectionModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-lg p-stack-md max-w-md w-full space-y-stack-md">
              <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                Reject Timesheet
              </h3>
              <p className="font-body-md text-on-surface-variant">
                Provide a reason for rejection. The tutor will be able to edit and resubmit.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Reason for rejection..."
                rows={3}
                className="w-full rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRejectionModal(null)}
                  className="px-4 py-2 rounded-lg text-on-surface-variant hover:bg-surface-variant text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRejectTimesheet(rejectionModal)}
                  className="bg-error text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Timesheets;
