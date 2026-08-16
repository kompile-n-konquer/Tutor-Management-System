import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";

import AllocationBoard from "./pages/organiser/AllocationBoard";
import TutorDashboard from "./pages/tutor/TutorDashboard";
import VolunteerView from "./pages/student/VolunteerView";
import Profile from "./pages/shared/Profile";

import Placeholder from "./pages/Placeholder";

import AppLayout from "./components/layout/AppLayout";

export default function App() {
  return (
    <Routes>

      {/* =========================
          PUBLIC PAGES
      ========================= */}

      <Route path="/" element={<Landing />} />

      <Route path="/signup" element={<SignUp />} />

      <Route path="/login" element={<Login />} />


      {/* =========================
          TUTOR MANAGEMENT SYSTEM
      ========================= */}

      <Route
        path="/allocation-board"
        element={
          <AppLayout
            role="tutor"
            title="Allocation Board"
            showSearch={true}
          >
            <AllocationBoard />
          </AppLayout>
        }
      />

      <Route
        path="/tutor-dashboard"
        element={
          <AppLayout
            role="tutor"
            title="Tutor Dashboard"
            showSearch={true}
          >
            <TutorDashboard />
          </AppLayout>
        }
      />

      <Route
        path="/volunteer"
        element={
          <AppLayout
            role="tutor"
            title="Volunteer View"
            showSearch={true}
          >
            <VolunteerView />
          </AppLayout>
        }
      />

      <Route
        path="/profile"
        element={
          <AppLayout
            role="tutor"
            title="Profile"
            showSearch={false}
          >
            <Profile />
          </AppLayout>
        }
      />


      {/* =========================
          OTHER PAGES
      ========================= */}

      <Route
        path="/timesheets"
        element={
          <AppLayout
            role="tutor"
            title="Timesheets"
            showSearch={true}
          >
            <Placeholder
              role="tutor"
              label="Timesheets"
            />
          </AppLayout>
        }
      />

      <Route
        path="/settings"
        element={
          <AppLayout
            role="tutor"
            title="Settings"
            showSearch={false}
          >
            <Placeholder
              role="tutor"
              label="Settings"
            />
          </AppLayout>
        }
      />

    </Routes>
  );
}