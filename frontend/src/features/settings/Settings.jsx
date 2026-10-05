import { useEffect } from "react";
import AppLayout from "../../components/layout/AppLayout";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import AppearanceSettings from "./AppearanceSettings";

// Per-user settings, shown to every signed-in role. Organiser-managed system
// configuration (claim policy, hourly rates, PDF template) lives on the
// organiser-only Configurations page instead.
const Settings = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate("/login");
    }
  }, [currentUser, loading, navigate]);

  if (loading) return null;
  if (!currentUser) return null;

  return (
    <AppLayout title="Settings" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Settings</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Personalise how TutorFlow looks and feels.
          </p>
        </div>

        {/* Settings stack — add new per-user settings here as self-contained
            cards (like AppearanceSettings), one component per setting. */}
        <div className="space-y-gutter">
          {/* Appearance applies to every signed-in user, not just organisers. */}
          <AppearanceSettings />
        </div>
      </div>
    </AppLayout>
  );
};

export default Settings;
