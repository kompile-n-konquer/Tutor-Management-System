import AppLayout from "../../components/layout/AppLayout";

export default function AdminView() {
  return (
    <AppLayout title="Admin View">
      <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-unit">
            Admin Overview
          </h2>
          <p className="font-body-sm text-on-surface-variant mb-stack-md">
            System administration, user management, and configuration.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Total Users</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-primary mt-unit">128</h3>
            </div>
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">Pending Approvals</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-urgent-orange mt-unit">7</h3>
            </div>
            <div className="bg-surface-container-low p-stack-md rounded-lg border border-surface-variant">
              <p className="font-label-caps text-label-caps text-on-surface-variant">System Status</p>
              <h3 className="font-headline-lg text-headline-lg font-bold text-trust-blue mt-unit">Healthy</h3>
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
