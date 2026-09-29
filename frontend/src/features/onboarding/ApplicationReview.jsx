import { useEffect, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import api from "../../utils/axiosInstance";
import useAsync from "../../hooks/useAsync";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const minutesToLabel = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default function ApplicationReview() {
  const { execute } = useAsync();
  const { execute: executeAction, isLoading: isActing } = useAsync();
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rank, setRank] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  async function loadApplications() {
    setLoading(true);
    const res = await execute(() => api.get("/onboarding/applications?status=PENDING"));
    if (res?.status === 200) {
      setApplications(res.data.applications || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadApplications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function viewDetail(appId) {
    setSelected(appId);
    setRank(null);
    setDetail(null);
    setActionMsg("");
    setShowRejectInput(false);
    setRejectionReason("");

    const [detailRes, rankRes] = await Promise.all([
      execute(() => api.get(`/onboarding/applications/${appId}`)),
      execute(() => api.get(`/onboarding/applications/${appId}/rank`)),
    ]);

    if (detailRes?.status === 200) setDetail(detailRes.data.application);
    if (rankRes?.status === 200) setRank(rankRes.data);
  }

  async function handleReview(appId, action) {
    setActionMsg("");
    const payload = { action };
    if (action === "REJECT") {
      payload.rejectionReason = rejectionReason;
    }

    const res = await executeAction(() =>
      api.patch(`/onboarding/applications/${appId}/review`, payload),
    );

    if (res?.status === 200) {
      setActionMsg(res.data.message);
      setSelected(null);
      setDetail(null);
      setRank(null);
      loadApplications();
    } else {
      setActionMsg(res?.data?.error || "Action failed");
    }
  }

  return (
    <AppLayout title="Application Review" showSearch={false}>
      <div className="p-stack-md md:p-margin-page max-w-container-max mx-auto w-full">
        <div className="mb-stack-lg">
          <h2 className="font-display text-display text-primary mb-unit">Role Applications</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Review pending tutor and lecturer applications from students.
          </p>
        </div>

        <div className="flex gap-gutter" style={{ minHeight: "70vh" }}>
          {/* ── Application list ──────────────────────────────────────── */}
          <div className="w-96 shrink-0 flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden">
            <div className="p-stack-md border-b border-surface-variant bg-surface">
              <h3 className="font-headline-md text-headline-md text-on-surface">
                Pending ({applications.length})
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-stack-sm space-y-stack-sm">
              {loading ? (
                <div className="space-y-stack-sm" aria-hidden="true">
                  {[0, 1, 2].map((card) => (
                    <div
                      key={card}
                      className="animate-pulse p-stack-md rounded-lg border border-surface-variant bg-surface-container-lowest space-y-stack-sm"
                    >
                      <div className="h-5 w-36 rounded bg-surface-container-high" />
                      <div className="h-4 w-48 rounded bg-surface-container-high/60" />
                      <div className="h-3 w-28 rounded bg-surface-container-high/60" />
                    </div>
                  ))}
                </div>
              ) : applications.length === 0 ? (
                <p className="text-center font-body-sm text-on-surface-variant py-stack-lg">
                  No pending applications.
                </p>
              ) : (
                applications.map((app) => (
                  <button
                    key={app.id}
                    onClick={() => viewDetail(app.id)}
                    className={`w-full text-left p-stack-md rounded-lg border cursor-pointer transition-colors ${
                      selected === app.id
                        ? "border-primary bg-primary-fixed"
                        : "border-surface-variant bg-surface-container-lowest hover:border-outline"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-unit">
                      <h4 className="font-body-md font-bold text-on-surface">
                        {app.user.firstName} {app.user.lastName}
                      </h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-label-caps ${
                          app.requestedRole === "TUTOR"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary/10 text-secondary"
                        }`}
                      >
                        {app.requestedRole}
                      </span>
                    </div>
                    <p className="font-body-sm text-on-surface-variant">{app.user.email}</p>
                    <div className="flex gap-stack-md mt-unit">
                      <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">event</span>
                        {new Date(app.submittedAt).toLocaleDateString()}
                      </span>
                      {app.availabilityCount != null && (
                        <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                          {app.availabilityCount} slots
                        </span>
                      )}
                    </div>
                    {app.courseMarks?.length > 0 && (
                      <p className="font-data-mono text-data-mono text-xs text-on-surface-variant mt-unit">
                        Avg mark: {Math.round(app.courseMarks.reduce((s, c) => s + c.mark, 0) / app.courseMarks.length)}%
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Detail panel ──────────────────────────────────────────── */}
          <div className="flex-1 bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden flex flex-col">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="font-body-sm text-on-surface-variant">
                  Select an application to review.
                </p>
              </div>
            ) : !detail ? (
              <div className="flex-1 p-stack-lg space-y-gutter" aria-hidden="true">
                <div className="animate-pulse flex items-center gap-stack-md">
                  <div className="w-12 h-12 rounded-full bg-surface-container-high" />
                  <div className="space-y-stack-sm">
                    <div className="h-6 w-48 rounded bg-surface-container-high" />
                    <div className="h-4 w-56 rounded bg-surface-container-high/60" />
                  </div>
                </div>
                <div className="animate-pulse space-y-stack-md">
                  <div className="h-4 w-40 rounded bg-surface-container-high" />
                  <div className="h-4 rounded bg-surface-container-high/60" />
                  <div className="h-4 rounded bg-surface-container-high/60" />
                  <div className="h-4 w-2/3 rounded bg-surface-container-high/60" />
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-stack-lg space-y-gutter">
                {/* Applicant info */}
                <div>
                  <div className="flex items-center gap-stack-md mb-stack-md">
                    <div className="w-12 h-12 rounded-full bg-surface-variant overflow-hidden flex items-center justify-center">
                      <span className="material-symbols-outlined text-2xl text-on-surface-variant">person</span>
                    </div>
                    <div>
                      <h3 className="font-headline-lg text-headline-lg text-on-surface">
                        {detail.user.firstName} {detail.user.lastName}
                      </h3>
                      <p className="font-body-sm text-on-surface-variant">{detail.user.email}</p>
                    </div>
                    <span
                      className={`ml-auto px-3 py-1 rounded-full text-xs font-label-caps ${
                        detail.requestedRole === "TUTOR"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-secondary/10 text-secondary border border-secondary/20"
                      }`}
                    >
                      {detail.requestedRole} Application
                    </span>
                  </div>
                </div>

                {/* Submitted data */}
                <div className="bg-surface-container-low rounded-lg border border-surface-variant p-stack-md">
                  <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-sm">
                    Application Details
                  </h4>
                  {detail.requestedRole === "TUTOR" && (
                    <div className="grid grid-cols-2 gap-stack-md">
                      <div>
                        <p className="font-label-caps text-[10px] text-outline mb-1">HOURLY RATE</p>
                        <p className="font-body-md text-on-surface">
                          {detail.hourlyRate != null ? `R${detail.hourlyRate}` : "Not specified"}
                        </p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[10px] text-outline mb-1">MAX HOURS/WEEK</p>
                        <p className="font-body-md text-on-surface">{detail.maxHoursPerWeek ?? "—"}</p>
                      </div>
                    </div>
                  )}
                  {detail.requestedRole === "LECTURER" && (
                    <div className="grid grid-cols-3 gap-stack-md">
                      <div>
                        <p className="font-label-caps text-[10px] text-outline mb-1">DEPARTMENT</p>
                        <p className="font-body-md text-on-surface">{detail.department}</p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[10px] text-outline mb-1">OFFICE LOCATION</p>
                        <p className="font-body-md text-on-surface">{detail.officeLocation || "—"}</p>
                      </div>
                      <div>
                        <p className="font-label-caps text-[10px] text-outline mb-1">OFFICE HOURS</p>
                        <p className="font-body-md text-on-surface">{detail.officeHours || "—"}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Rank suggestions (tutor only) */}
                {detail.requestedRole === "TUTOR" && rank && (
                  <div className="bg-surface-container-low rounded-lg border border-surface-variant p-stack-md">
                    <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-sm">
                      Rank Suggestion
                    </h4>
                    <div className="flex items-center gap-stack-lg mb-stack-md">
                      <div className="text-center">
                        <p className="font-display text-display text-primary">{rank.rankScore}</p>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">Overall Score</p>
                      </div>
                      <div className="text-center">
                        <p className="font-headline-md text-headline-md text-on-surface">{rank.avgCourseMark}%</p>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">Avg Mark</p>
                      </div>
                      <div className="text-center">
                        <p className="font-headline-md text-headline-md text-on-surface">
                          {rank.availabilityCount}/{rank.totalPossibleSlots}
                        </p>
                        <p className="font-label-caps text-label-caps text-on-surface-variant">Availability</p>
                      </div>
                    </div>
                    {rank.courses?.length > 0 && (
                      <div className="space-y-unit">
                        <p className="font-label-caps text-label-caps text-on-surface-variant">Course Performance</p>
                        {rank.courses.map((c) => (
                          <div key={c.courseCode} className="flex justify-between items-center p-unit bg-surface-container-lowest rounded">
                            <span className="font-body-sm text-on-surface">{c.courseCode} — {c.courseName}</span>
                            <div className="flex items-center gap-unit">
                              <span className={`font-data-mono text-data-mono font-bold ${c.aboveMinimum ? "text-trust-blue" : "text-urgent-orange"}`}>
                                {c.mark}%
                              </span>
                              <span className="font-body-sm text-outline">(min {c.minimumMark}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Availability grid */}
                {detail.availability?.length > 0 && (
                  <div className="bg-surface-container-low rounded-lg border border-surface-variant p-stack-md">
                    <h4 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-stack-sm">
                      Availability ({detail.availability.length} slots)
                    </h4>
                    <div className="overflow-x-auto">
                      <div className="min-w-[500px] grid grid-cols-6 gap-px bg-outline-variant/30 text-xs">
                        <div className="bg-surface-container-lowest p-1" />
                        {DAYS.map((d) => (
                          <div key={d} className="bg-surface-container-lowest p-1 text-center font-label-caps text-on-surface-variant">
                            {d}
                          </div>
                        ))}
                        {(() => {
                          const bySlot = {};
                          detail.availability.forEach((a) => {
                            if (!bySlot[a.timeSlotId]) bySlot[a.timeSlotId] = {};
                            bySlot[a.timeSlotId][a.dayOfWeek] = true;
                          });
                          const slotEntries = Object.entries(bySlot);
                          return slotEntries.map(([slotId, days]) => {
                            const slot = detail.availability.find((a) => a.timeSlotId === Number(slotId));
                            return (
                              <div key={slotId} className="contents">
                                <div className="bg-surface-container-lowest p-1 text-right font-data-mono text-outline">
                                  {slot ? `${minutesToLabel(slot.timeSlot.startMinute)}` : slotId}
                                </div>
                                {DAYS.map((_, di) => (
                                  <div
                                    key={di}
                                    className={`p-1 text-center ${days[di] ? "bg-primary/20 text-primary" : "bg-surface-container-lowest"}`}
                                  >
                                    {days[di] ? "✓" : ""}
                                  </div>
                                ))}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="border-t border-surface-variant pt-stack-md">
                  {actionMsg && (
                    <div className="mb-stack-md p-stack-sm rounded-lg bg-trust-blue/10 border border-trust-blue/20 font-body-sm text-trust-blue">
                      {actionMsg}
                    </div>
                  )}

                  {showRejectInput ? (
                    <div className="space-y-stack-sm mb-stack-md">
                      <label className="font-label-caps text-label-caps text-on-surface-variant">Rejection Reason (optional)</label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="w-full p-stack-sm border border-outline-variant rounded-lg bg-surface-container-lowest text-on-surface font-body-sm resize-none"
                        rows={3}
                        placeholder="Provide a reason for rejection..."
                      />
                      <div className="flex gap-stack-sm">
                        <button
                          onClick={() => handleReview(detail.id, "REJECT")}
                          disabled={isActing}
                          className="bg-error text-on-error px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isActing ? "Processing..." : "Confirm Rejection"}
                        </button>
                        <button
                          onClick={() => setShowRejectInput(false)}
                          className="px-4 py-2 border border-outline-variant text-on-surface rounded-lg font-label-caps text-label-caps hover:bg-surface-container transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-stack-md">
                      <button
                        onClick={() => handleReview(detail.id, "APPROVE")}
                        disabled={isActing}
                        className="bg-trust-blue text-on-trust-blue px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-unit"
                      >
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        {isActing ? "Processing..." : "Approve"}
                      </button>
                      <button
                        onClick={() => setShowRejectInput(true)}
                        disabled={isActing}
                        className="bg-error-container text-on-error-container px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-unit border border-error/20"
                      >
                        <span className="material-symbols-outlined text-[18px]">cancel</span>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
