import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout";
import Button from "../../components/button/Button";
import Input from "../../components/input/Input";
import ErrorMessage from "../../components/error-message/ErrorMessage";
import useAsync from "../../hooks/useAsync";
import api from "../../utils/axiosInstance";

export default function LecturerApplication() {
  const navigate = useNavigate();
  const { execute, isLoading, error, setError } = useAsync();
  const [form, setForm] = useState({
    department: "",
    officeLocation: "",
    officeHours: "",
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
      requestedRole: "LECTURER",
      department: form.department,
      officeLocation: form.officeLocation || null,
      officeHours: form.officeHours || null,
    };

    const res = await execute(() => api.post("/onboarding/apply", payload));
    if (res?.status === 201) {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <AppLayout title="Lecturer Application" showSearch={false}>
        <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] text-center">
            <span className="material-symbols-outlined text-5xl text-trust-blue mb-stack-md">check_circle</span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface mb-unit">Application Submitted!</h2>
            <p className="font-body-md text-on-surface-variant mb-stack-lg">
              Your lecturer application has been submitted and is pending review by an organiser.
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
    <AppLayout title="Lecturer Application" showSearch={false}>
      <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
        <div className="mb-stack-lg">
          <button
            onClick={() => navigate("/onboarding")}
            className="flex items-center gap-unit text-on-surface-variant hover:text-primary transition-colors mb-stack-md font-body-sm"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Onboarding
          </button>
          <h2 className="font-display text-display text-primary mb-unit">Apply to Become a Lecturer</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Provide your department and office details. An organiser will review your application.
          </p>
        </div>

        <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <form onSubmit={handleSubmit} className="space-y-stack-md">
            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Department <span className="text-error">*</span>
              </label>
              <Input
                placeholder="Computer Science and Applied Mathematics"
                value={form.department}
                onChange={(e) => handleChange(e, "department")}
                icon="apartment"
              />
            </div>

            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Office Location
              </label>
              <Input
                placeholder="Maths Building, Room 204"
                value={form.officeLocation}
                onChange={(e) => handleChange(e, "officeLocation")}
                icon="location_on"
              />
              <p className="font-body-sm text-outline mt-unit">Optional. Your physical office location.</p>
            </div>

            <div>
              <label className="font-label-caps text-label-caps text-on-surface-variant block mb-unit">
                Office Hours
              </label>
              <Input
                placeholder="Mon/Wed 14:00-16:00"
                value={form.officeHours}
                onChange={(e) => handleChange(e, "officeHours")}
                icon="schedule"
              />
              <p className="font-body-sm text-outline mt-unit">Optional. Your regular office hours.</p>
            </div>

            {error && <ErrorMessage>{error}</ErrorMessage>}

            <div className="flex gap-stack-md pt-stack-sm">
              <Button
                type="submit"
                disabled={!form.department}
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
