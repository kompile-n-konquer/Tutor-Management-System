import React from 'react';

export default function VolunteerView() {
  return (
    <main className="flex-1 overflow-y-auto p-stack-md md:p-margin-page bg-background space-y-gutter">
      <div className="bg-surface-container-lowest p-stack-md rounded-xl border border-surface-variant shadow-sm">
        <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-unit">Volunteer Opportunities</h2>
        <p className="font-body-sm text-on-surface-variant mb-stack-md">Support your peer tutors and earn recognized university volunteer hours.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
          <div className="p-stack-md border border-surface-variant rounded-lg bg-surface-container-low flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-unit">
                <h3 className="font-headline-md text-body-lg font-bold text-primary">Peer Mentorship Workshop</h3>
                <span className="bg-secondary-fixed text-on-secondary-container text-xs px-2 py-1 rounded font-data-mono">5 Hours</span>
              </div>
              <p className="font-body-sm text-on-surface-variant">Assist first-year computer science students during exam preparation sessions.</p>
            </div>
            <button className="mt-stack-md bg-primary text-white py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity">
              Apply to Volunteer
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}