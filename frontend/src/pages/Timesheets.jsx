import React from 'react';

export default function Timesheets() {
  return (
    <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
      <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm">
        <div className="flex justify-between items-center mb-stack-md">
          <h2 className="font-headline-md text-headline-md font-bold text-on-surface">Weekly Timesheets</h2>
          <button className="bg-primary text-white px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90">
            Submit New Log
          </button>
        </div>

        <div className="space-y-stack-sm">
          <div className="p-stack-md border border-surface-variant rounded-lg flex justify-between items-center bg-surface-container-low">
            <div>
              <p className="font-body-md font-bold text-on-surface">Week 12: Oct 10 - Oct 16</p>
              <p className="font-data-mono text-xs text-on-surface-variant">Total Logged: 12.5 hrs</p>
            </div>
            <span className="bg-trust-blue/10 text-trust-blue px-3 py-1 rounded font-data-mono text-xs font-bold">Approved</span>
          </div>
        </div>
      </div>
    </main>
  );
}