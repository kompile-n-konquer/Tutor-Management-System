import { createBrowserRouter } from 'react-router-dom';

import RootLayout from './RootLayout.jsx';
import ErrorPage from './components/error-page/ErrorPage.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';

import Home from './features/home/Home.jsx';
import Login from './features/auth/login/Login.jsx';
import Signup from './features/auth/signup/Signup.jsx';
import ForgotPassword from './features/auth/forgot-password/ForgotPassword.jsx';
import ConfirmationMessage from './features/auth/confirmation-message/ConfirmationMessage.jsx';

import Organiser from './features/organiser/Organiser.jsx';
import OrganiserAnalytics from './features/organiser/OrganiserAnalytics.jsx';
import TutorDashboard from './features/tutor-dashboard/TutorDashboard.jsx';
import VolunteerView from './features/volunteering/VolunteerView.jsx';
import Profile from './features/profile/Profile.jsx';
import EditProfile from './features/profile/EditProfile.jsx';
import EditTimetable from './features/timetable/EditTimetable.jsx';
import AddCourse from './features/courses/AddCourse.jsx';
import ViewAllCourses from './features/courses/ViewAllCourses.jsx';
import CourseDetails from './features/courses/CourseDetails.jsx';
import EditCourse from './features/courses/EditCourse.jsx';
import Events from './features/events/Events.jsx';
import AddEvent from './features/events/AddEvent.jsx';
import EventDetails from './features/events/EventDetails.jsx';
import EditEvent from './features/events/EditEvent.jsx';
import Timesheets from './features/timesheets/Timesheets.jsx';
import EditTimesheet from './features/timesheets/EditTimesheet.jsx';
import TimesheetDetails from './features/timesheets/TimesheetDetails.jsx';
import Applications from './features/applications/Applications.jsx';
import OpportunityDetails from './features/applications/OpportunityDetails.jsx';
import Settings from './features/settings/Settings.jsx';
import LecturerView from './features/lecturer-view/LecturerView.jsx';
import AdminView from './features/admin-view/AdminView.jsx';
import OnboardingHub from './features/onboarding/OnboardingHub.jsx';
import TutorApplication from './features/onboarding/TutorApplication.jsx';
import LecturerApplication from './features/onboarding/LecturerApplication.jsx';
import ApplicationReview from './features/onboarding/ApplicationReview.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: 'signup', element: <Signup /> },
      { path: 'login', element: <Login /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'confirmation-message', element: <ConfirmationMessage /> },
      // Every route below is protected. Signed-out visitors are sent to /login;
      // signed-in users whose role is not allowed see the 404 ErrorPage instead
      // of a generic error. Omitting allowedRoles allows any signed-in role.
      {
        path: 'organiser',
        element: (
          <ProtectedRoute allowedRoles={['organiser', 'admin']}>
            <Organiser />
          </ProtectedRoute>
        ),
      },
      {
        path: 'organiser-analytics',
        element: (
          <ProtectedRoute allowedRoles={['organiser', 'admin']}>
            <OrganiserAnalytics />
          </ProtectedRoute>
        ),
      },
      {
        path: 'tutor-dashboard',
        element: (
          <ProtectedRoute allowedRoles={['tutor']}>
            <TutorDashboard />
          </ProtectedRoute>
        ),
      },
      {
        path: 'volunteer',
        element: (
          <ProtectedRoute allowedRoles={['student', 'tutor']}>
            <VolunteerView />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile',
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      {
        path: 'profile/edit',
        element: (
          <ProtectedRoute>
            <EditProfile />
          </ProtectedRoute>
        ),
      },
      {
        path: 'timetable/edit',
        element: (
          <ProtectedRoute>
            <EditTimetable />
          </ProtectedRoute>
        ),
      },
      {
        path: 'applications',
        children: [
          {
            index: true,
            element: (
              <ProtectedRoute allowedRoles={['student', 'tutor']}>
                <Applications />
              </ProtectedRoute>
            ),
          },
          {
            path: ':courseId',
            element: (
              <ProtectedRoute allowedRoles={['student', 'tutor']}>
                <OpportunityDetails />
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'timesheets',
        children: [
          {
            index: true,
            element: (
              <ProtectedRoute>
                <Timesheets />
              </ProtectedRoute>
            ),
          },
          {
            path: ':id',
            element: (
              <ProtectedRoute>
                <EditTimesheet />
              </ProtectedRoute>
            ),
          },
          {
            path: ':id/details',
            element: (
              <ProtectedRoute>
                <TimesheetDetails />
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute allowedRoles={['organiser', 'admin']}>
            <Settings />
          </ProtectedRoute>
        ),
      },
      {
        path: 'courses',
        children: [
          {
            index: true,
            element: (
              <ProtectedRoute allowedRoles={['lecturer', 'organiser']}>
                <ViewAllCourses />
              </ProtectedRoute>
            ),
          },
          {
            path: 'add',
            element: (
              <ProtectedRoute allowedRoles={['lecturer']}>
                <AddCourse />
              </ProtectedRoute>
            ),
          },
          {
            path: ':courseId',
            element: (
              <ProtectedRoute allowedRoles={['lecturer', 'organiser']}>
                <CourseDetails />
              </ProtectedRoute>
            ),
          },
          {
            path: ':courseId/edit',
            element: (
              <ProtectedRoute allowedRoles={['lecturer', 'organiser']}>
                <EditCourse />
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'events',
        children: [
          {
            index: true,
            element: (
              <ProtectedRoute allowedRoles={['tutor', 'lecturer', 'organiser', 'admin']}>
                <Events />
              </ProtectedRoute>
            ),
          },
          {
            path: 'add',
            element: (
              <ProtectedRoute allowedRoles={['lecturer']}>
                <AddEvent />
              </ProtectedRoute>
            ),
          },
          {
            path: ':id',
            element: (
              <ProtectedRoute allowedRoles={['tutor', 'lecturer', 'organiser', 'admin']}>
                <EventDetails />
              </ProtectedRoute>
            ),
          },
          {
            path: ':id/edit',
            element: (
              <ProtectedRoute allowedRoles={['lecturer']}>
                <EditEvent />
              </ProtectedRoute>
            ),
          },
        ],
      },
      {
        path: 'lecturer-view',
        element: (
          <ProtectedRoute allowedRoles={['lecturer']}>
            <LecturerView />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin-view',
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminView />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding',
        element: (
          <ProtectedRoute allowedRoles={['student']}>
            <OnboardingHub />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding/tutor-application',
        element: (
          <ProtectedRoute allowedRoles={['student']}>
            <TutorApplication />
          </ProtectedRoute>
        ),
      },
      {
        path: 'onboarding/lecturer-application',
        element: (
          <ProtectedRoute allowedRoles={['student']}>
            <LecturerApplication />
          </ProtectedRoute>
        ),
      },
      {
        path: 'application-review',
        element: (
          <ProtectedRoute allowedRoles={['organiser']}>
            <ApplicationReview />
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <ErrorPage /> },
    ],
  },
]);

export default router;
