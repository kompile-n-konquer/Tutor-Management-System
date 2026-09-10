import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./RootLayout.jsx";
import ErrorPage from "./components/error-page/ErrorPage.jsx";

import Home from "./features/home/Home.jsx";
import Login from "./features/auth/login/Login.jsx";
import Signup from "./features/auth/signup/Signup.jsx";
import ForgotPassword from "./features/auth/forgot-password/ForgotPassword.jsx";
import ConfirmationMessage from "./features/auth/confirmation-message/ConfirmationMessage.jsx";

import Organiser from "./features/organiser/Organiser.jsx";
import OrganiserAnalytics from "./features/organiser/OrganiserAnalytics.jsx";
import TutorDashboard from "./features/tutor-dashboard/TutorDashboard.jsx";
import VolunteerView from "./features/volunteering/VolunteerView.jsx";
import Profile from "./features/profile/Profile.jsx";
import EditTimetable from "./features/timetable/EditTimetable.jsx";
import Timesheets from "./features/timesheets/Timesheets.jsx";
import Settings from "./features/settings/Placeholder.jsx";
import LecturerView from "./features/lecturer-view/LecturerView.jsx";
import AdminView from "./features/admin-view/AdminView.jsx";

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
      { path: "organiser", element: <Organiser /> },
      { path: "organiser-analytics", element: <OrganiserAnalytics /> },
      { path: "tutor-dashboard", element: <TutorDashboard /> },
      { path: "volunteer", element: <VolunteerView /> },
      { path: "profile", element: <Profile /> },
      { path: "timetable/edit", element: <EditTimetable /> },
      { path: "timesheets", element: <Timesheets /> },
      { path: "settings", element: <Settings /> },
      { path: "lecturer-view", element: <LecturerView /> },
      { path: "admin-view", element: <AdminView /> },
    ],
  },
]);

export default router;
