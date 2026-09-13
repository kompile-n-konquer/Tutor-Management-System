import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import { auth } from '../../firebase/firebase';
import useAsync from '../../hooks/useAsync';
import api from '../../utils/axiosInstance';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts minutes since midnight (480) into a time label ("08:00")
const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();
  const { execute: executeTimetable, isLoading: isLoadingTimetable } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [availability, setAvailability] = useState([]); // [{ dayOfWeek, timeSlotId }]
  const [lockedSlots, setLockedSlots] = useState([]); // [{ dayOfWeek, timeSlotId }] held by submitted applications
  const [profileData, setProfileData] = useState({ firstName: '', lastName: '', phoneNumber: '', yearOfStudy: '', email: '', createdAt: null });

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
        setLockedSlots(response.data.lockedSlots || []);
      }
    };

    loadTimetable();
  }, [currentUser, loading, executeTimetable]);

  // Fetch full user profile (phoneNumber, yearOfStudy) from the backend
  useEffect(() => {
    if (loading || !currentUser) return;
    const loadProfile = async () => {
      const res = await execute(() => api.get(`/users/${currentUser.uid}`));
      if (res?.status === 200 && res.data) {
        setProfileData({
          firstName: res.data.firstName || '',
          lastName: res.data.lastName || '',
          phoneNumber: res.data.phoneNumber || '',
          yearOfStudy: res.data.yearOfStudy || '',
          email: res.data.email || '',
          createdAt: res.data.createdAt || null,
        });
      }
    };
    loadProfile();
  }, [currentUser, loading, execute]);

  if (loading) return null; // TODO: Create a professional loading state 
  if (!currentUser) return null;

  const availableKeys = new Set(availability.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));
  const lockedKeys = new Set(lockedSlots.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));

  const handleDeleteAccount = async () => {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();

      const headers = { Authorization: `Bearer ${token}` };
      const response = await execute(() => api.delete('/users', { headers }));

      if (response.status === 204) {
        await signOut(auth);
        navigate('/');
      }
    }
  };

  return (
    <AppLayout role="tutor" title="Settings" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-display text-primary">
              {profileData.firstName} {profileData.lastName}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {profileData.yearOfStudy
                ? `${profileData.yearOfStudy.charAt(0).toUpperCase() + profileData.yearOfStudy.slice(1)} Student` : 'Student'}
              {profileData.createdAt ? ` \u00B7 Joined: ${new Date(profileData.createdAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1E90FF]/10 text-[#1E90FF] font-label-caps text-label-caps border border-[#1E90FF]/20">
              <span className="material-symbols-outlined text-[16px]">verified</span> Active Tutor
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-label-caps text-label-caps border border-outline-variant/50">
              <span className="material-symbols-outlined text-[16px]">schedule</span> 120h Logged
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4 space-y-gutter">
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Personal Info</h3>
                <button
                  onClick={() => navigate('/profile/edit')}
                  className="text-primary hover:text-primary-container cursor-pointer"
                  title="Edit personal info"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
              </div>
              <div className="space-y-4">
                {[
                  ['EMAIL', profileData.email],
                  ['PHONE', profileData.phoneNumber || '—'],
                  ['DEPARTMENT', 'School of Computer Science'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="font-label-caps text-[10px] text-outline mb-1">{label}</p>
                    <p className="font-body-md text-body-md text-on-surface">{value}</p>
                  </div>
                ))}
                <div>
                  <p className="font-label-caps text-[10px] text-outline mb-1">YEAR OF STUDY</p>
                  <p className="font-body-md text-body-md text-on-surface">
                    {profileData.yearOfStudy
                      ? profileData.yearOfStudy.charAt(0).toUpperCase() + profileData.yearOfStudy.slice(1)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">Academic History</h3>
                <span className="material-symbols-outlined text-outline text-[20px]">school</span>
              </div>
              <div className="space-y-3">
                {[
                  { code: 'CS301: Data Structures', term: 'Fall 2023', grade: 'A+', status: 'Eligible', active: false },
                  {
                    code: 'CS450: Machine Learning',
                    term: 'Spring 2024',
                    grade: 'A',
                    status: 'Eligible',
                    active: false,
                  },
                  { code: 'CS502: Operating Systems', term: 'Current', grade: 'IP', status: 'Pending', active: true },
                ].map((c) => (
                  <div
                    key={c.code}
                    className={`flex justify-between items-center p-2 hover:bg-surface-container-low rounded-lg transition-colors ${
                      c.active ? 'border-l-4 border-[#FF8C00] bg-[#FF8C00]/5' : ''
                    }`}
                  >
                    <div>
                      <p className="font-body-md font-semibold text-on-surface">{c.code}</p>
                      <p className="font-body-sm text-on-surface-variant">{c.term}</p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-data-mono text-data-mono font-bold ${c.active ? 'text-[#FF8C00]' : 'text-primary'}`}
                      >
                        {c.grade}
                      </p>
                      <p className="font-body-sm text-outline">{c.status}</p>
                    </div>
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

                  {timeSlots.map((slot) => (
                    <div key={slot.id} className="contents">
                      <div className="bg-surface-container-lowest p-2 text-right font-data-mono text-body-sm text-outline border-b border-outline-variant/20">
                        {minutesToLabel(slot.startMinute)}
                      </div>
                      {DAYS.map((day, dayIndex) => {
                        const isAvailable = availableKeys.has(`${dayIndex}-${slot.id}`);
                        const isLocked = lockedKeys.has(`${dayIndex}-${slot.id}`);
                        return (
                          <div
                            key={`${slot.id}-${day}`}
                            className={`p-2 border-b border-outline-variant/20 relative ${
                              isLocked
                                ? 'bg-urgent-orange/5'
                                : isAvailable
                                ? 'bg-primary/5'
                                : 'bg-surface-container-lowest'
                            }`}
                          >
                            {isLocked ? (
                              <div className="absolute inset-1 bg-urgent-orange/20 border border-urgent-orange/30 rounded flex items-center justify-center gap-1 font-label-caps text-[10px] text-urgent-orange">
                                <span className="material-symbols-outlined text-[12px]">lock</span>
                                Locked
                              </div>
                            ) : isAvailable ? (
                              <div className="absolute inset-1 bg-primary/20 border border-primary/30 rounded flex items-center justify-center font-label-caps text-[10px] text-primary">
                                Available
                              </div>
                            ) : null}
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
