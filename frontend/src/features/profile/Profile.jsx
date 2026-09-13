import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import { auth } from '../../firebase/firebase';
import useAsync from '../../hooks/useAsync';
import api from '../../utils/axiosInstance';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import useAuth from '../../hooks/useAuth';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts minutes since midnight (480) into a time label ("08:00")
const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, userProfile, role, loading } = useAuth();
  const { execute, isLoading } = useAsync();
  const { execute: executeTimetable } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [availability, setAvailability] = useState([]); // [{ dayOfWeek, timeSlotId }]

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    if (loading || !currentUser) return;

    const loadTimetable = async () => {
      const response = await executeTimetable(() => api.get('/availability'));
      if (response && response.status === 200) {
        setTimeSlots(response.data.timeSlots);
        setAvailability(response.data.availability);
      }
    };

    loadTimetable();
  }, [currentUser, loading, executeTimetable]);

  if (loading) return null; // TODO: Create a professional loading state 
  if (!currentUser) return null;

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  // Only show the slots around the current hour: 1 hour before, the current hour, and 1 hour after.
  // If the current time is outside every slot (early morning / evening), fall back to the
  // 3 slots nearest to now so the grid is never empty.
  const currentHourStart = Math.floor(nowMinutes / 60) * 60;
  let visibleSlots = timeSlots.filter(
    (slot) => slot.endMinute > currentHourStart - 60 && slot.startMinute < currentHourStart + 120
  );

  if (visibleSlots.length === 0 && timeSlots.length > 0) {
    if (nowMinutes < timeSlots[0].startMinute) {
      visibleSlots = timeSlots.slice(0, 3);
    } else {
      visibleSlots = timeSlots.slice(-3);
    }
  }

  const availableKeys = new Set(availability.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));

  // Position of the thin grey current-time line as a percentage of the grid height.
  // The first grid row is the day header, so the line is offset by one row.
  let currentTimeTop = null;
  if (visibleSlots.length > 0) {
    const firstStart = visibleSlots[0].startMinute;
    const lastEnd = visibleSlots[visibleSlots.length - 1].endMinute;
    if (nowMinutes >= firstStart && nowMinutes <= lastEnd) {
      const fraction = (nowMinutes - firstStart) / (lastEnd - firstStart);
      currentTimeTop = ((1 + fraction * visibleSlots.length) / (visibleSlots.length + 1)) * 100;
    }
  }

  const handleDeleteAccount = async () => {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();

      const headers = { Authorization: `Bearer ${token}` };
      const response = await execute(() => api.delete('/users', { headers }));

      if (response?.status === 204) {
        await signOut(auth);
        navigate('/');
      }
    }
  };

  const displayName = userProfile
    ? `${userProfile.firstName} ${userProfile.lastName}`
    : 'Loading...';
  const displayId = userProfile?.studentNumber || userProfile?.employeeNumber || '';
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

  return (
    <AppLayout title="Settings" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-display text-primary">{displayName}</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {displayId ? `${roleLabel} · ID: ${displayId}` : roleLabel}
            </p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1E90FF]/10 text-[#1E90FF] font-label-caps text-label-caps border border-[#1E90FF]/20">
              <span className="material-symbols-outlined text-[16px]">verified</span> {roleLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4 space-y-gutter">
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Personal Info</h3>
                <button className="text-primary hover:text-primary-container">
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
              </div>
              <div className="space-y-4">
                {[
                  ['EMAIL', userProfile?.email || ''],
                  ['PHONE', userProfile?.phoneNumber || 'Not provided'],
                  ['DEPARTMENT', userProfile?.studentNumber ? 'Student' : userProfile?.employeeNumber ? 'Staff' : ''],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label}>
                    <p className="font-label-caps text-[10px] text-outline mb-1">{label}</p>
                    <p className="font-body-md text-body-md text-on-surface">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Button onClick={handleDeleteAccount} loading={isLoading}>
                Delete Account
              </Button>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-gutter">
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col h-[500px]">
              <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <div>
                  <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                    Availability &amp; Schedule
                  </h3>
                  <p className="font-body-sm text-outline mt-1">
                    Set your preferred tutoring hours for the current semester.
                  </p>
                </div>
                <button onClick={() => navigate('/timetable/edit')} className="px-4 py-1.5 border border-[#1E90FF] text-[#1E90FF] rounded-lg font-label-caps text-label-caps hover:bg-[#1E90FF]/5 transition-colors cursor-pointer">
                  Edit Timetable
                </button>
              </div>
              <div className="flex-1 overflow-x-auto calendar-scroll relative">
                {currentTimeTop !== null && (
                  <div
                    className="absolute left-0 right-0 z-10 border-t border-outline-variant pointer-events-none"
                    style={{ top: `${currentTimeTop}%` }}
                  />
                )}
                <div className="min-w-[600px] h-full grid grid-cols-6 gap-px bg-outline-variant/30">
                  <div className="bg-surface-container-lowest p-2" />
                  {DAYS.map((d) => (
                    <div
                      key={d}
                      className="bg-surface-container-lowest p-2 text-center font-label-caps text-label-caps text-on-surface-variant"
                    >
                      {d}
                    </div>
                  ))}

                  {visibleSlots.map((slot) => (
                    <div key={slot.id} className="contents">
                      <div className="bg-surface-container-lowest p-2 text-right font-data-mono text-body-sm text-outline border-b border-outline-variant/20">
                        {minutesToLabel(slot.startMinute)}
                      </div>
                      {DAYS.map((day, dayIndex) => {
                        const isAvailable = availableKeys.has(`${dayIndex}-${slot.id}`);
                        return (
                          <div
                            key={`${slot.id}-${day}`}
                            className={`p-2 border-b border-outline-variant/20 relative ${
                              isAvailable ? 'bg-primary/5' : 'bg-surface-container-lowest'
                            }`}
                          >
                            {isAvailable && (
                              <div className="absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary">
                                Available
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-4">
                  Notifications
                </h3>
                <div className="space-y-4">
                  {[
                    ['New Allocation Requests', true],
                    ['Schedule Changes', true],
                    ['Timesheet Reminders', false],
                  ].map(([label, checked]) => (
                    <label key={label} className="flex items-center justify-between cursor-pointer">
                      <span className="font-body-md text-on-surface">{label}</span>
                      <div className="relative">
                        <input defaultChecked={checked} className="sr-only peer" type="checkbox" />
                        <div className="w-11 h-6 bg-surface-container-high rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary" />
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-4">Security</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-body-md text-on-surface">Two-Factor Authentication</p>
                      <p className="font-body-sm text-outline">Enabled via University SSO</p>
                    </div>
                    <span className="material-symbols-outlined text-[#1E90FF]">check_circle</span>
                  </div>
                  <div className="pt-4 border-t border-outline-variant/30">
                    <button className="w-full py-2 border border-outline text-on-surface rounded-lg font-label-caps text-label-caps hover:bg-surface-container transition-colors">
                      Manage Connected Devices
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
