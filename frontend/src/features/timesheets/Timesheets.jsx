import { useMemo, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import { TIMESHEETS as INITIAL_TIMESHEETS } from "../../data/mockData";

export default function Timesheets({ role = "tutor" }) {
  const [timesheets, setTimesheets] = useState(INITIAL_TIMESHEETS);
  const [selectedIds, setSelectedIds] = useState([]);

  const pending = useMemo(() => timesheets.filter((t) => t.status === "pending"), [timesheets]);
  const approved = useMemo(() => timesheets.filter((t) => t.status === "approved"), [timesheets]);
  const allPendingSelected = pending.length > 0 && pending.every((t) => selectedIds.includes(t.id));

  function toggleSelect(id) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleSelectAll() {
    setSelectedIds(allPendingSelected ? [] : pending.map((t) => t.id));
  }
  function bulkApprove() {
    if (selectedIds.length === 0) return;
    setTimesheets((prev) => prev.map((t) => (selectedIds.includes(t.id) ? { ...t, status: "approved" } : t)));
    setSelectedIds([]);
  }

  return (
    <AppLayout role={role} title="Tutor Management System">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        <div className="flex justify-between items-end mb-stack-lg flex-wrap gap-4">
          <div>
            <h2 className="font-display text-display text-primary">Timesheets</h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
              Review and approve submitted hours for this pay period.
            </p>
          </div>
          <button
            onClick={bulkApprove}
            disabled={selectedIds.length === 0}
            className="bg-primary text-on-primary font-label-caps text-label-caps px-stack-md py-stack-sm rounded-lg hover:bg-primary-container transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">done_all</span>
            Approve Selected ({selectedIds.length})
          </button>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-surface border-b border-outline-variant">
              <tr>
                <th className="p-stack-sm w-10">
                  <input
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all pending timesheets"
                    className="h-4 w-4 text-primary rounded border-outline-variant"
                  />
                </th>
                <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Tutor</th>
                <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Course</th>
                <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Week Of</th>
                <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Hours</th>
                <th className="p-stack-sm font-label-caps text-label-caps text-on-surface-variant">Status</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((t) => (
                <tr key={t.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low">
                  <td className="p-stack-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(t.id)}
                      onChange={() => toggleSelect(t.id)}
                      className="h-4 w-4 text-primary rounded border-outline-variant"
                    />
                  </td>
                  <td className="p-stack-sm font-body-md text-on-surface">{t.tutorName}</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">{t.courseCode}</td>
                  <td className="p-stack-sm font-body-sm text-on-surface-variant">{t.weekOf}</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-primary font-bold">{t.hours}h</td>
                  <td className="p-stack-sm">
                    <span className="font-label-caps text-label-caps text-urgent-orange bg-urgent-orange/10 px-2 py-0.5 rounded">
                      PENDING
                    </span>
                  </td>
                </tr>
              ))}
              {approved.map((t) => (
                <tr key={t.id} className="border-b border-outline-variant/50 opacity-60">
                  <td className="p-stack-sm" />
                  <td className="p-stack-sm font-body-md text-on-surface">{t.tutorName}</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface-variant">{t.courseCode}</td>
                  <td className="p-stack-sm font-body-sm text-on-surface-variant">{t.weekOf}</td>
                  <td className="p-stack-sm font-data-mono text-data-mono text-on-surface">{t.hours}h</td>
                  <td className="p-stack-sm">
                    <span className="font-label-caps text-label-caps text-trust-blue bg-trust-blue/10 px-2 py-0.5 rounded">
                      APPROVED
                    </span>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && approved.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-stack-lg text-center text-on-surface-variant font-body-sm">
                    No timesheets submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}