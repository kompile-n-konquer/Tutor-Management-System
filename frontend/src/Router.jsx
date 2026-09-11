import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./RootLayout.jsx";
import ErrorPage from "./components/error-page/ErrorPage.jsx";

import Home from "./features/home/Home.jsx";
import Login from "./features/auth/login/Login.jsx";
import Signup from "./features/auth/signup/Signup.jsx";
import ForgotPassword from "./features/auth/forgot-password/ForgotPassword.jsx";
import ConfirmationMessage from "./features/auth/confirmation-message/ConfirmationMessage.jsx";

import AllocationBoard from "./features/allocation-board/AllocationBoard.jsx";
import TutorDashboard from "./features/tutor-dashboard/TutorDashboard.jsx";
import VolunteerView from "./features/volunteering/VolunteerView.jsx";
import Profile from "./features/profile/Profile.jsx";
import EditTimetable from "./features/timetable/EditTimetable.jsx";
import AddCourse from "./features/courses/AddCourse.jsx";
import ViewAllCourses from "./features/courses/ViewAllCourses.jsx";
import CourseDetails from "./features/courses/CourseDetails.jsx";
import EditCourse from "./features/courses/EditCourse.jsx";
import Timesheets from "./features/timesheets/Timesheets.jsx";
import Applications from "./features/applications/Applications.jsx";
import OpportunityDetails from "./features/applications/OpportunityDetails.jsx";
import Settings from "./features/settings/Settings.jsx";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: "signup", element: <Signup /> },
      { path: "login", element: <Login /> },
      { path: "forgot-password", element: <ForgotPassword /> },
      { path: "confirmation-message", element: <ConfirmationMessage /> },
      { path: "allocation-board", element: <AllocationBoard /> },
      { path: "tutor-dashboard", element: <TutorDashboard /> },
      { path: "volunteer", element: <VolunteerView /> },
      { path: "profile", element: <Profile /> },
      { path: "timetable/edit", element: <EditTimetable /> },
      { path: "applications", children: [
        { index: true, element: <Applications /> },
        { path: ":courseId", element: <OpportunityDetails /> },
      ] },
      { path: "timesheets", element: <Timesheets /> },
      { path: "settings", element: <Settings /> },
      { path: "courses", children: [
        { index: true, element: <ViewAllCourses /> },
        { path: "add", element: <AddCourse /> },
        { path: ":courseId", element: <CourseDetails /> },
        { path: ":courseId/edit", element: <EditCourse /> },
      ]  
      },
    ],
  },
]);

export default router;