import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import Button from '../../components/button/Button';
import ErrorMessage from '../../components/error-message/ErrorMessage';
import { auth } from '../../firebase/firebase';
import useAsync from '../../hooks/useAsync';
import api from '../../utils/axiosInstance';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import useAuth from '../../hooks/useAuth';
import { formatSessionDate, formatSessionTimeRange } from '../../utils/formatSession';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// Converts minutes since midnight (480) into a time label ("08:00")
const minutesToLabel = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const capitalise = (value) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');

// Students and tutors work with the weekly availability grid; staff roles
// (lecturer, organiser, admin) have no tutoring availability of their own.
const isStudentRole = (role) => role === 'student' || role === 'tutor';

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, role, loading } = useAuth();
  const { execute, isLoading } = useAsync();
  const { execute: executeTimetable } = useAsync();

  const [timeSlots, setTimeSlots] = useState([]); // [{ id, startMinute, endMinute }]
  const [availability, setAvailability] = useState([]); // [{ dayOfWeek, timeSlotId }]
  const [sessions, setSessions] = useState([]); // upcoming sessions for the profile timetable
  const [lockedSlots, setLockedSlots] = useState([]); // [{ dayOfWeek, timeSlotId }] held by submitted applications
  const [lecturerCourses, setLecturerCourses] = useState([]); // the lecturer's own courses (via /sessions/lecturer)
  const [platformStats, setPlatformStats] = useState(null); // organiser/admin aggregates (via /analytics/organiser)
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    yearOfStudy: '',
    email: '',
    studentNumber: '',
    employeeNumber: '',
    createdAt: null,
  });
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate('/login');
    }
  }, [currentUser, loading, navigate]);

  // Fetch upcoming sessions for tutors (/sessions/mine) or volunteered
  // sessions for students (/sessions/volunteered).  Other roles silently
  // skip — the section simply won't render.
  const fetchSessions = useCallback(async () => {
    try {
      if (role === 'tutor') {
        const response = await api.get('/sessions/mine');
        if (response?.status === 200) {
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const upcoming = (response.data?.sessions ?? []).filter(
            (s) => new Date(s.date) >= now,
          );
          setSessions(upcoming);
        }
      } else if (role === 'student') {
        const response = await api.get('/sessions/volunteered');
        if (response?.status === 200) {
          setSessions(response.data?.sessions ?? []);
        }
      }
    } catch {
      // Silently ignore — the sessions section just won't appear.
    }
  }, [role]);

  // The lecturer's own courses with their tutors, upcoming events and open
  // follow-ups — the same feed the LecturerView page consumes.
  const fetchLecturerCourses = useCallback(async () => {
    try {
      const response = await api.get('/sessions/lecturer');
      if (response?.status === 200) {
        setLecturerCourses(response.data?.courses ?? []);
      }
    } catch {
      // Silently ignore — the courses section shows its empty state.
    }
  }, []);

  // Organiser/admin aggregates straight from the analytics endpoint — the
  // same figures the Analytics page renders, computed live from the database.
  const fetchPlatformStats = useCallback(async () => {
    try {
      const response = await api.get('/analytics/organiser');
      if (response?.status === 200) {
        setPlatformStats(response.data ?? null);
      }
    } catch {
      // Silently ignore — the overview section simply won't render.
    }
  }, []);

  useEffect(() => {
    if (loading || !currentUser) return;

    // Only student roles have a tutoring availability grid to show.
    if (isStudentRole(role)) {
      const loadTimetable = async () => {
        const response = await executeTimetable(() => api.get('/availability'));
        if (response && response.status === 200) {
          setTimeSlots(response.data.timeSlots);
          setAvailability(response.data.availability);
          setLockedSlots(response.data.lockedSlots || []);
        }
      };

      loadTimetable();
    }

    (async () => {
      await fetchSessions();
    })();
  }, [currentUser, loading, role, executeTimetable, fetchSessions]);

  // Role-specific staff panels: courses for lecturers, platform aggregates
  // for organisers and admins.
  useEffect(() => {
    if (loading || !currentUser || !role) return;

    if (role === 'lecturer') {
      (async () => {
        await fetchLecturerCourses();
      })();
    } else if (role === 'organiser' || role === 'admin') {
      (async () => {
        await fetchPlatformStats();
      })();
    }
  }, [currentUser, loading, role, fetchLecturerCourses, fetchPlatformStats]);

  // Fetch full user profile (phone, year of study, role identifiers) from the backend
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
          studentNumber: res.data.studentNumber || '',
          employeeNumber: res.data.employeeNumber || '',
          createdAt: res.data.createdAt || null,
        });
        setLoadError('');
      } else {
        // A failed profile load must not silently render blank placeholders
        setLoadError(res?.data?.message || 'Could not load your profile. Please try again.');
      }
    };
    loadProfile();
  }, [currentUser, loading, execute, reloadKey]);

  // The page frame stays a skeleton until the auth state resolves — same
  // animate-pulse treatment as every other loading state in the app.
  if (loading) {
    return (
      <div
        className="p-gutter md:p-margin-page max-w-container-max mx-auto space-y-gutter"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="h-10 w-64 rounded bg-surface-container-high animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4 h-72 rounded-xl bg-surface-container-high/60 animate-pulse" />
          <div className="lg:col-span-8 h-96 rounded-xl bg-surface-container-high/60 animate-pulse" />
        </div>
      </div>
    );
  }
  if (!currentUser) return null;

  const availableKeys = new Set(availability.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));
  const lockedKeys = new Set(lockedSlots.map((entry) => `${entry.dayOfWeek}-${entry.timeSlotId}`));

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

  const roleLabel = role ? capitalise(role) : 'User';
  const joinedLabel = profileData.createdAt
    ? `Member since ${new Date(profileData.createdAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}`
    : '';
  // Students and tutors study; staff roles don't carry a year of study.
  const subtitleParts = [
    isStudentRole(role) && profileData.yearOfStudy ? capitalise(profileData.yearOfStudy) : '',
    joinedLabel,
  ].filter(Boolean);

  // Personal info rows, differentiated by what the role actually has
  const infoRows = [
    ['EMAIL', profileData.email || '—'],
    ['PHONE', profileData.phoneNumber || '—'],
    ...(isStudentRole(role)
      ? [
          ['YEAR OF STUDY', profileData.yearOfStudy ? capitalise(profileData.yearOfStudy) : '—'],
          ['STUDENT NUMBER', profileData.studentNumber || '—'],
        ]
      : [['EMPLOYEE NUMBER', profileData.employeeNumber || '—']]),
    ['MEMBER SINCE', joinedLabel || '—'],
  ];

  return (
    <AppLayout title="Profile" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-display text-primary">
              {profileData.firstName} {profileData.lastName}
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              {subtitleParts.join(' \u00B7 ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {profileData.studentNumber && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-variant text-on-surface-variant font-data-mono text-data-mono border border-outline-variant/40">
                <span className="material-symbols-outlined text-[16px]">badge</span>
                Student № {profileData.studentNumber}
              </span>
            )}
            {profileData.employeeNumber && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-variant text-on-surface-variant font-data-mono text-data-mono border border-outline-variant/40">
                <span className="material-symbols-outlined text-[16px]">badge</span>
                Employee № {profileData.employeeNumber}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-trust-blue/10 text-trust-blue font-label-caps text-label-caps border border-trust-blue/20">
              <span className="material-symbols-outlined text-[16px]">verified</span> {roleLabel}
            </span>
          </div>
        </div>

        {loadError && (
          <div className="mb-gutter flex flex-wrap items-center gap-gutter">
            <ErrorMessage>{loadError}</ErrorMessage>
            <Button
              className="min-w-32"
              onClick={() => {
                setLoadError('');
                setReloadKey((key) => key + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
          <div className="lg:col-span-4 space-y-gutter">
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
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
                {infoRows.map(([label, value]) => (
                  <div key={label}>
                    <p className="font-label-caps text-[10px] text-outline mb-1">{label}</p>
                    <p className="font-body-md text-body-md text-on-surface break-words">{value}</p>
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
            {/* ── Availability grid: students and tutors only ── */}
            {isStudentRole(role) && (
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento flex flex-col h-[500px]">
                <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Availability &amp; Schedule
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Set your preferred tutoring hours for the current semester.
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/timetable/edit')}
                    className="px-4 py-1.5 border border-trust-blue text-trust-blue rounded-lg font-label-caps text-label-caps hover:bg-trust-blue/5 transition-colors cursor-pointer"
                  >
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
            )}

            {/* ── Scheduled sessions (tutors: upcoming sessions, students: volunteered work) ── */}
            {(role === 'tutor' || role === 'student') && sessions.length > 0 && (
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
                <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      {role === 'tutor' ? 'Scheduled Sessions' : 'Volunteer Work'}
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      {role === 'tutor'
                        ? 'Your upcoming tutoring sessions.'
                        : 'Sessions you have volunteered for.'}
                    </p>
                  </div>
                  <span className="font-data-mono text-body-sm text-on-surface-variant">
                    {sessions.length} session{sessions.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-unit">
                  {sessions.map((session) => {
                    // Build a status chip appropriate for the role.
                    let chip;
                    if (role === 'tutor') {
                      // Tutor feed: /sessions/mine only carries this tutor's
                      // own sessions, never another tutor's rows.
                      chip =
                        session.status === 'UNASSIGNED'
                          ? { cls: 'bg-urgent-orange/10 text-urgent-orange', label: 'Excused' }
                          : session.status === 'PENDING'
                            ? { cls: 'bg-trust-blue/10 text-trust-blue', label: 'Volunteer pending' }
                            : { cls: 'bg-primary/10 text-primary', label: 'You lead' };
                    } else {
                      // Student volunteer view
                      chip =
                        session.volunteerStatus === 'APPROVED'
                          ? { cls: 'bg-primary/10 text-primary', label: 'Approved' }
                          : { cls: 'bg-trust-blue/10 text-trust-blue', label: 'Pending' };
                    }

                    return (
                      <div
                        key={session.id}
                        className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit px-stack-md py-unit border-b border-outline-variant/20 last:border-0"
                      >
                        <span className="font-data-mono text-data-mono font-semibold text-primary min-w-[5.5rem]">
                          {session.course?.courseCode ?? '—'}
                        </span>
                        <span className="font-body-md text-body-md text-on-surface flex-1 min-w-0">
                          {session.course?.courseName}
                        </span>
                        <span className="font-data-mono text-body-sm text-on-surface-variant">
                          {formatSessionDate(session.date)} · {formatSessionTimeRange(session)}
                        </span>
                        {session.courseSlot?.venue && (
                          <span className="font-body-sm text-body-sm text-outline">
                            {session.courseSlot.venue}
                          </span>
                        )}
                        <span className={`${chip.cls} px-2 py-0.5 rounded font-label-caps text-label-caps`}>
                          {chip.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Lecturer: their own courses with live staffing + schedule counts ── */}
            {role === 'lecturer' && (
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
                <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      My Courses
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Courses registered under your lecturer profile.
                    </p>
                  </div>
                  <span className="font-data-mono text-body-sm text-on-surface-variant">
                    {lecturerCourses.length} course{lecturerCourses.length === 1 ? '' : 's'}
                  </span>
                </div>

                {lecturerCourses.length === 0 ? (
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    You do not own any courses yet. Courses appear here once they are registered
                    against your lecturer profile.
                  </p>
                ) : (
                  <ul className="divide-y divide-outline-variant/20">
                    {lecturerCourses.map((course) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const upcomingEvents = course.events.filter(
                        (event) => new Date(event.date) >= today,
                      ).length;
                      const openFollowUps = course.sessions.filter(
                        (session) =>
                          new Date(session.date) >= today && session.status !== 'SCHEDULED',
                      ).length;

                      return (
                        <li
                          key={course.id}
                          className="flex flex-wrap items-baseline gap-x-stack-md gap-y-unit py-stack-sm"
                        >
                          <span className="font-data-mono text-data-mono font-semibold text-primary">
                            {course.courseCode}
                          </span>
                          <span className="font-body-md text-body-md text-on-surface flex-1 min-w-[10rem] break-words">
                            {course.courseName}
                          </span>
                          <span className="font-label-caps text-label-caps text-on-surface-variant">
                            {course.tutors.length} tutor{course.tutors.length === 1 ? '' : 's'}
                          </span>
                          <span className="font-label-caps text-label-caps text-on-surface-variant">
                            {upcomingEvents} upcoming event{upcomingEvents === 1 ? '' : 's'}
                          </span>
                          {openFollowUps > 0 && (
                            <span className="font-label-caps text-label-caps bg-urgent-orange/10 text-urgent-orange px-2 py-0.5 rounded">
                              {openFollowUps} open follow-up{openFollowUps === 1 ? '' : 's'}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* ── Organiser/Admin: live platform aggregates from the analytics endpoint ── */}
            {(role === 'organiser' || role === 'admin') && platformStats && (
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-bento">
                <div className="flex items-center justify-between mb-stack-md pb-stack-sm border-b border-outline-variant/30">
                  <div>
                    <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                      Platform Overview
                    </h3>
                    <p className="font-body-sm text-outline mt-1">
                      Live figures from the {role === 'admin' ? 'system' : 'organiser'} database.
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-outline text-[20px]">monitoring</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-unit">
                  {[
                    { icon: 'menu_book', label: 'Courses', value: platformStats.totals?.courses ?? 0 },
                    { icon: 'school', label: 'Lecturers', value: platformStats.totals?.lecturers ?? 0 },
                    { icon: 'groups', label: 'Tutors', value: platformStats.totals?.tutors ?? 0 },
                    { icon: 'person', label: 'Students', value: platformStats.totals?.students ?? 0 },
                    {
                      icon: 'event_upcoming',
                      label: 'Upcoming events',
                      value: platformStats.totals?.upcomingEvents ?? 0,
                    },
                    {
                      icon: 'history_edu',
                      label: 'Timesheet sign-off',
                      value: `${platformStats.timesheets?.signOffRate ?? 0}%`,
                    },
                    {
                      icon: 'workspace_premium',
                      label: 'Role applications pending',
                      value: platformStats.applications?.role?.pending ?? 0,
                    },
                    {
                      icon: 'assignment',
                      label: 'Course applications pending',
                      value: platformStats.applications?.course?.pending ?? 0,
                    },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-stack-md flex flex-col gap-1"
                    >
                      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                        {tile.icon}
                      </span>
                      <p className="font-data-mono text-data-mono text-xl font-bold text-on-surface">
                        {tile.value}
                      </p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant leading-snug">
                        {tile.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
