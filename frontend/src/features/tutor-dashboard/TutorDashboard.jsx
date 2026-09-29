import AppLayout from "../../components/layout/AppLayout";
import OnboardingWalkthrough from "../../components/onboarding/OnboardingWalkthrough";
import { useFirstVisit } from "../../hooks/useFirstVisit";
import TutorDashboardContent from "./TutorDashboardContent";

const TUTOR_ONBOARDING_STEPS = [
  { title: "Welcome to your Tutor Dashboard", body: "This is where you'll see upcoming sessions, hours logged, and quick actions every time you log in." },
  { title: "Your Weekly Schedule", body: "The calendar shows every session you're assigned to this week. Click Sync Calendar to add these to your personal calendar app." },
  { title: "Quick Actions", body: "Need to skip a session or pick up more hours? Use Quick Actions instead of emailing your organiser directly." },
  { title: "Submitting Timesheets", body: "At the end of each pay period, review your logged hours here and submit with one click." },
];

export default function TutorDashboard() {
  const { isFirstVisit, markSeen } = useFirstVisit("tutor-dashboard");

  return (
    <AppLayout title="Tutor Management System">
      {isFirstVisit && <OnboardingWalkthrough steps={TUTOR_ONBOARDING_STEPS} onDismiss={markSeen} />}
      <TutorDashboardContent />
    </AppLayout>
  );
}
