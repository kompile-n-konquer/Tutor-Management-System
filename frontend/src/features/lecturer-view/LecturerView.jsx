import AppLayout from "../../components/layout/AppLayout";

export default function LecturerView() {
  return (
    <AppLayout title="Lecturer View">
      <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-unit">
            Lecturer Overview
          </h2>
          <p className="font-body-sm text-on-surface-variant mb-stack-md">
            Manage course allocations, review tutor applications, and approve timesheets.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Active Courses</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-primary mt-unit">3</h3>
            </div>
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Pending Applications</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-urgent-orange mt-unit">5</h3>
            </div>
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Timesheets to Review</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-trust-blue mt-unit">12</h3>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
