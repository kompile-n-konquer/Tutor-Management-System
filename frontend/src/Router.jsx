import { createBrowserRouter } from "react-router-dom";

import RootLayout from "./RootLayout.jsx";
import ErrorPage from "./components/error-page/ErrorPage.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";

import Home from "./features/home/Home.jsx";
import Login from "./features/auth/login/Login.jsx";
import Signup from "./features/auth/signup/Signup.jsx";
import ForgotPassword from "./features/auth/forgot-password/ForgotPassword.jsx";
import ConfirmationMessage from "./features/auth/confirmation-message/ConfirmationMessage.jsx";

import AllocationBoard from "./features/allocation-board/AllocationBoard.jsx";
import TutorDashboard from "./features/tutor-dashboard/TutorDashboard.jsx";
import VolunteerView from "./features/volunteering/VolunteerView.jsx";
import Profile from "./features/profile/Profile.jsx";
import Timesheets from "./features/timesheets/Timesheets.jsx";
import Placeholder from "./features/settings/Placeholder.jsx";

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

      {
        path: "allocation-board",
        element: (
          <AppLayout role="tutor" title="Allocation Board" showSearch={true}>
            <AllocationBoard />
          </AppLayout>
        ),
      },
      {
        path: "tutor-dashboard",
        element: (
          <AppLayout role="tutor" title="Tutor Dashboard" showSearch={true}>
            <TutorDashboard />
          </AppLayout>
        ),
      },
      {
        path: "volunteer",
        element: (
          <AppLayout role="tutor" title="Volunteer View" showSearch={true}>
            <VolunteerView />
          </AppLayout>
        ),
      },
      {
        path: "profile",
        element: (
          <AppLayout role="tutor" title="Profile" showSearch={false}>
            <Profile />
          </AppLayout>
        ),
      },
      {
        path: "timesheets",
        element: (
          <AppLayout role="tutor" title="Timesheets" showSearch={true}>
            <Timesheets />
          </AppLayout>
        ),
      },
      {
        path: "settings",
        element: (
          <AppLayout role="tutor" title="Settings" showSearch={false}>
            <Placeholder role="tutor" label="Settings" />
          </AppLayout>
        ),
      },
    ],
  },
]);

export default router;