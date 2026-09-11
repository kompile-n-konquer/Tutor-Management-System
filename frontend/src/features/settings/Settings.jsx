import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import Button from "../../components/button/Button";
import Input from "../../components/input/Input";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import api from "../../utils/axiosInstance";
import useAsync from "../../hooks/useAsync";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

// A month has at most 744 hours (31 days) — the backend enforces the same bound
const MAX_MONTHLY_HOURS = 744;

const Settings = () => {
  const navigate = useNavigate();
  const { currentUser, loading } = useAuth();
  const { execute, isLoading } = useAsync();

  const [monthlyHours, setMonthlyHours] = useState(""); // string so the Input stays controllable
  const [savedMonthlyHours, setSavedMonthlyHours] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const role = currentUser?.role?.toLowerCase();
  const isOrganiser = role === "organiser" || role === "admin";

  useEffect(() => {
    if (!loading && !currentUser) {
      navigate("/login");
    }
  }, [currentUser, loading, navigate]);

  useEffect(() => {
    if (loading || !currentUser || !isOrganiser) return;

    const loadSettings = async () => {
      const response = await execute(() => api.get("/settings"));
      if (response && response.status === 200) {
        const hours = response.data.tutorMonthlyClaimableHours;
        setMonthlyHours(hours === null ? "" : String(hours));
        setSavedMonthlyHours(hours);
      } else {
        setError("Could not load the settings. Please refresh the page.");
      }
    };

    loadSettings();
  }, [currentUser, loading, isOrganiser, execute]);

  if (loading) return null;
  if (!currentUser) return null;

  const parsedHours = Number(monthlyHours);
  const hoursEntered = monthlyHours !== "";
  const hoursValid =
    hoursEntered &&
    !Number.isNaN(parsedHours) &&
    Number.isInteger(parsedHours) &&
    parsedHours >= 1 &&
    parsedHours <= MAX_MONTHLY_HOURS;
  const hasChanges = hoursEntered && parsedHours !== savedMonthlyHours;

  const handleSave = async () => {
    setSaved(false);
    setError("");

    const response = await execute(() =>
      api.put("/settings/tutor-monthly-hours", { tutorMonthlyClaimableHours: parsedHours })
    );

    if (response && response.status === 200) {
      setSavedMonthlyHours(response.data.tutorMonthlyClaimableHours);
      setSaved(true);
    } else {
      setError(response?.data?.message || "Could not save the setting. Please try again.");
    }
  };

  return (
    <AppLayout role="organiser" title="Settings" showSearch={false}>
      <div className="p-gutter md:p-margin-page">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary">Settings</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Manage system-wide preferences.
          </p>
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        {isOrganiser ? (
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)] max-w-xl">
            <div className="mb-stack-md pb-stack-sm border-b border-outline-variant/30">
              <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                Max Claimable Hours
              </h3>
              <p className="font-body-sm text-outline mt-1">
                The maximum number of hours a tutor can claim in a month.
              </p>
            </div>

            <Input
              labelText="Hours per month"
              type="number"
              icon="schedule"
              placeholder="e.g. 60"
              value={monthlyHours}
              onChange={(event) => {
                setSaved(false);
                setMonthlyHours(event.target.value);
              }}
            />

            {saved && (
              <p className="mt-gutter font-body-sm text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Setting saved successfully.
              </p>
            )}

            <div className="mt-gutter flex items-center gap-4">
              <Button
                onClick={handleSave}
                disabled={!hoursValid || !hasChanges}
                loading={isLoading}
                className="min-w-40"
              >
                Save Changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-stack-lg shadow-[0px_4px_20px_rgba(0,0,0,0.04)] max-w-xl">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-outline text-[32px]">tune</span>
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  Settings coming soon
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                  Settings are not yet implemented. They will be available here later.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Settings;
