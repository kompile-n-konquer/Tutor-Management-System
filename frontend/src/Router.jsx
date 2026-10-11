import { createBrowserRouter } from 'react-router-dom';

import RootLayout from './RootLayout.jsx';
import ErrorPage from './components/error-page/ErrorPage.jsx';

import Home from './features/home/Home.jsx';
import AuthEntryPage from './features/auth/entry/AuthEntryPage.jsx';
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
import Cover from './features/cover/Cover.jsx';
import NewCoverOffer from './features/cover/NewCoverOffer.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      // /signup and /login now open the auth overlay over the landing page —
      // AuthEntryPage keeps the deep links working.
      { path: 'signup', element: <AuthEntryPage mode="signup" /> },
      { path: 'login', element: <AuthEntryPage mode="login" /> },
      { path: 'forgot-password', element: <ForgotPassword /> },
      { path: 'confirmation-message', element: <ConfirmationMessage /> },
      { path: 'organiser', element: <Organiser /> },
      { path: 'organiser-analytics', element: <OrganiserAnalytics /> },
      { path: 'tutor-dashboard', element: <TutorDashboard /> },
      { path: 'volunteer', element: <VolunteerView /> },
      { path: 'profile', element: <Profile /> },
      { path: 'profile/edit', element: <EditProfile /> },
      { path: 'timetable/edit', element: <EditTimetable /> },
      {
        path: 'applications',
        children: [
          { index: true, element: <Applications /> },
          { path: ':courseId', element: <OpportunityDetails /> },
        ],
      },
      {
        path: 'timesheets',
        children: [
          { index: true, element: <Timesheets /> },
          { path: ':id', element: <EditTimesheet /> },
          { path: ':id/details', element: <TimesheetDetails /> },
        ],
      },
      { path: 'settings', element: <Settings /> },
      {
        path: 'courses',
        children: [
          { index: true, element: <ViewAllCourses /> },
          { path: 'add', element: <AddCourse /> },
          { path: ':courseId', element: <CourseDetails /> },
          { path: ':courseId/edit', element: <EditCourse /> },
        ],
      },
      {
        path: 'events',
        children: [
          { index: true, element: <Events /> },
          { path: 'add', element: <AddEvent /> },
          { path: ':id', element: <EventDetails /> },
          { path: ':id/edit', element: <EditEvent /> },
        ],
      },
      { path: 'lecturer-view', element: <LecturerView /> },
      { path: 'admin-view', element: <AdminView /> },
      { path: 'onboarding', element: <OnboardingHub /> },
      { path: 'onboarding/tutor-application', element: <TutorApplication /> },
      { path: 'onboarding/lecturer-application', element: <LecturerApplication /> },
      { path: 'application-review', element: <ApplicationReview /> },
      {
        path: 'cover',
        children: [
          { index: true, element: <Cover /> },
          { path: 'new', element: <NewCoverOffer /> },
        ],
      },
      { path: '*', element: <ErrorPage /> },
    ],
  },
]);

export default router;
