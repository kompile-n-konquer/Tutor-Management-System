import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../../components/layout/AppLayout";
import useAuth from "../../hooks/useAuth";
import useAsync from "../../hooks/useAsync";
import api from "../../utils/axiosInstance";

const STATUS_BADGE = {
  PENDING: "bg-urgent-orange/10 text-urgent-orange border-urgent-orange/20",
  APPROVED: "bg-trust-blue/10 text-trust-blue border-trust-blue/20",
  REJECTED: "bg-error-container text-on-error-container border-error/20",
};

export default function OnboardingHub() {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const { execute } = useAsync();

  const [applications, setApplications] = useState([]);
  const [hasAvailability, setHasAvailability] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function load() {
      const res = await execute(() => api.get("/onboarding/my-applications"));
      if (!cancelled && res?.status === 200) {
        setApplications(res.data.applications || []);
        setHasAvailability(res.data.hasAvailability ?? false);
      }
      if (!cancelled) setLoadingData(false);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  if (authLoading || loadingData) {
    return (
      <AppLayout title="Onboarding">
        <div className="flex items-center justify-center p-stack-lg">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>
      </AppLayout>
    );
  }

  const pendingTutor = applications.find((a) => a.requestedRole === "TUTOR" && a.status === "PENDING");
  const pendingLecturer = applications.find((a) => a.requestedRole === "LECTURER" && a.status === "PENDING");

  return (
    <AppLayout title="Onboarding" showSearch={false}>
      <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full space-y-gutter">
        <div>
          <h2 className="font-display text-display text-primary mb-unit">Grow Your Role</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Apply to become a Tutor or Lecturer. Your application will be reviewed by an organiser.
          </p>
        </div>

        {/* ── Role option cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
          {/* Become a Tutor */}
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-stack-sm mb-stack-md">
                <span className="material-symbols-outlined text-3xl text-primary">assignment_ind</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">Become a Tutor</h3>
              </div>
              <p className="font-body-sm text-on-surface-variant mb-stack-md">
                Help fellow students by tutoring courses you've excelled in. You'll need to configure your
                weekly availability before applying.
              </p>
              {!hasAvailability && (
                <div className="bg-secondary-fixed/30 border border-secondary/20 rounded-lg p-stack-sm mb-stack-md">
                  <p className="font-body-sm text-on-surface-variant flex items-center gap-unit">
                    <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
                    You must set your availability in your Profile before applying.
                  </p>
                </div>
              )}
            </div>
            {pendingTutor ? (
              <div className={`inline-flex items-center gap-unit px-3 py-1.5 rounded-full border text-xs font-label-caps ${STATUS_BADGE.PENDING}`}>
                <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                Application Pending
              </div>
            ) : (
              <button
                onClick={() => navigate("/onboarding/tutor-application")}
                disabled={!hasAvailability}
                className="mt-stack-md bg-primary text-on-primary py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {hasAvailability ? "Apply to Become a Tutor" : "Set Availability First"}
              </button>
            )}
          </div>

          {/* Become a Lecturer */}
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-stack-sm mb-stack-md">
                <span className="material-symbols-outlined text-3xl text-secondary">school</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">Become a Lecturer</h3>
              </div>
              <p className="font-body-sm text-on-surface-variant mb-stack-md">
                Share your expertise by lecturing courses. Provide your department and office details to apply.
              </p>
            </div>
            {pendingLecturer ? (
              <div className={`inline-flex items-center gap-unit px-3 py-1.5 rounded-full border text-xs font-label-caps ${STATUS_BADGE.PENDING}`}>
                <span className="material-symbols-outlined text-[16px]">hourglass_empty</span>
                Application Pending
              </div>
            ) : (
              <button
                onClick={() => navigate("/onboarding/lecturer-application")}
                className="mt-stack-md bg-secondary text-on-secondary py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
              >
                Apply to Become a Lecturer
              </button>
            )}
          </div>
        </div>

        {/* ── Application history ───────────────────────────────────── */}
        {applications.length > 0 && (
          <div className="bg-surface-container-lowest p-stack-lg rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-md">Your Applications</h3>
            <div className="space-y-stack-sm">
              {applications.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-stack-md bg-surface-container-low rounded-lg border border-surface-variant"
                >
                  <div>
                    <p className="font-body-md font-bold text-on-surface">
                      {app.requestedRole} Application
                    </p>
                    <p className="font-body-sm text-on-surface-variant">
                      Submitted {new Date(app.submittedAt).toLocaleDateString()}
                    </p>
                    {app.rejectionReason && (
                      <p className="font-body-sm text-error mt-unit">
                        Reason: {app.rejectionReason}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-unit px-3 py-1.5 rounded-full border text-xs font-label-caps ${
                      STATUS_BADGE[app.status] || STATUS_BADGE.PENDING
                    }`}
                  >
                    {app.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
