import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout";
import Button from "../../components/button/Button";
import Input from "../../components/input/Input";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import useAsync from "../../hooks/useAsync";
import api from "../../utils/axiosInstance";

export default function TutorApplication() {
  const navigate = useNavigate();
  const { execute, isLoading, error, setError } = useAsync();
  const [form, setForm] = useState({
    hourlyRate: "",
    maxHoursPerWeek: "",
  });
  const [success, setSuccess] = useState(false);

  const handleChange = (e, name) => {
    setError("");
    setForm((prev) => ({ ...prev, [name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const payload = {
      requestedRole: "TUTOR",
      hourlyRate: form.hourlyRate ? Number(form.hourlyRate) : null,
      maxHoursPerWeek: Number(form.maxHoursPerWeek),
    };

    const res = await execute(() => api.post("/onboarding/apply", payload));
    if (res?.status === 201) {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <AppLayout title="Tutor Application" showSearch={false}>
        <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] text-center">
            <span className="material-symbols-outlined text-5xl text-trust-blue mb-stack-md">check_circle</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-unit">Application Submitted!</h2>
            <p className="font-body-md text-on-surface-variant mb-stack-lg">
              Your tutor application has been submitted and is pending review by an organiser.
            </p>
            <div className="flex justify-center gap-stack-md">
              <button
                onClick={() => navigate("/onboarding")}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
              >
                Back to Onboarding
              </button>
              <button
                onClick={() => navigate("/volunteer")}
                className="bg-surface-container-high text-on-surface px-6 py-2 rounded-lg font-label-caps text-label-caps hover:bg-surface-variant transition-colors border border-outline-variant"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Tutor Application" showSearch={false}>
      <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
        <div className="mb-stack-lg">
          <button
            onClick={() => navigate("/onboarding")}
            className="flex items-center gap-unit text-on-surface-variant hover:text-primary transition-colors mb-stack-md font-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Onboarding
          </button>
          <h2 className="font-display text-display text-primary mb-unit">Apply to Become a Tutor</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Provide your tutoring preferences below. An organiser will review your application and
            availability before making a decision.
          </p>
        </div>

        <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <form onSubmit={handleSubmit} className="space-y-stack-md">
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Hourly Rate (ZAR)
              </label>
              <Input
                type="number"
                placeholder="150"
                value={form.hourlyRate}
                onChange={(e) => handleChange(e, "hourlyRate")}
                icon="payments"
              />
              <p className="font-body-sm text-outline mt-unit">
                Optional. Your preferred hourly rate. The organiser may adjust this during approval.
              </p>
            </div>

            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Maximum Hours per Week <span className="text-error">*</span>
              </label>
              <Input
                type="number"
                placeholder="10"
                value={form.maxHoursPerWeek}
                onChange={(e) => handleChange(e, "maxHoursPerWeek")}
                icon="schedule"
              />
              <p className="font-body-sm text-outline mt-unit">
                Required. The maximum number of tutoring hours you can commit to each week (1-40).
              </p>
            </div>

            <div className="bg-primary-fixed/30 border border-primary/20 rounded-lg p-stack-md">
              <p className="font-body-sm text-on-surface-variant flex items-start gap-unit">
                <span className="material-symbols-outlined text-primary text-[18px] shrink-0 mt-0.5">info</span>
                <span>
                  Your availability has already been configured. The organiser will review it alongside this
                  application. You can update your availability at any time from your Profile.
                </span>
              </p>
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="flex gap-stack-md pt-stack-sm">
              <Button
                type="submit"
                disabled={!form.maxHoursPerWeek || Number(form.maxHoursPerWeek) < 1 || Number(form.maxHoursPerWeek) > 40}
                loading={isLoading}
              >
                Submit Application
              </Button>
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                className="px-6 py-2 border border-outline-variant text-on-surface rounded-lg font-label-caps text-label-caps hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
