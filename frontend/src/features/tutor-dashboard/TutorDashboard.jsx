import React from 'react';

export default function TutorDashboard() {
  return (
    <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
      {/* Top Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Allocated Hours</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-primary mt-unit">18 / 20 hrs</h3>
          </div>
          <span className="material-symbols-outlined text-primary text-3xl">schedule</span>
        </div>

        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Active Courses</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-on-surface mt-unit">2 Assigned</h3>
          </div>
          <span className="material-symbols-outlined text-trust-blue text-3xl">book</span>
        </div>

        <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm flex justify-between items-center">
          <div>
            <p className="font-label-caps text-label-caps text-on-surface-variant">Timesheet Status</p>
            <h3 className="font-headline-lg text-headline-lg font-bold text-trust-blue mt-unit">Approved</h3>
          </div>
          <span className="material-symbols-outlined text-trust-blue text-3xl">verified</span>
        </div>
      </div>

      {/* Schedule & Tasks Table */}
      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-stack-md">Assigned Tutoring Sessions</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                <th className="py-stack-sm px-stack-md">Course</th>
                <th className="py-stack-sm px-stack-md">Day / Time</th>
                <th className="py-stack-sm px-stack-md">Location</th>
                <th className="py-stack-sm px-stack-md">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-variant font-body-md">
              <tr>
                <td className="py-stack-sm px-stack-md font-bold text-primary">CS101 - Intro Programming</td>
                <td className="py-stack-sm px-stack-md font-data-mono">Mon / 10:00 AM - 12:00 PM</td>
                <td className="py-stack-sm px-stack-md">Lab 3B</td>
                <td className="py-stack-sm px-stack-md">
                  <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">Active</span>
                </td>
              </tr>
              <tr>
                <td className="py-stack-sm px-stack-md font-bold text-primary">CS305 - Database Systems</td>
                <td className="py-stack-sm px-stack-md font-data-mono">Wed / 02:00 PM - 04:00 PM</td>
                <td className="py-stack-sm px-stack-md">Lab 1A</td>
                <td className="py-stack-sm px-stack-md">
                  <span className="bg-trust-blue/10 text-trust-blue px-2 py-1 rounded text-xs font-semibold">Active</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}