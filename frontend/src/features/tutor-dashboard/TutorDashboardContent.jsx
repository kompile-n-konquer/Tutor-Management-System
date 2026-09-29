/**
 * TutorDashboardContent
 * The tutor dashboard body (greeting, session cards, weekly schedule, quick
 * actions and timesheet card), extracted from TutorDashboard so it can be
 * reused verbatim: the authenticated route renders it inside AppLayout while
 * the landing page renders it inside the DashboardPreview window.
 */
export default function TutorDashboardContent() {
  return (
    <div className="p-margin-page max-w-container-max mx-auto w-full">
      <div className="mb-stack-lg">
        <h2 className="font-display text-display text-primary mb-unit">Welcome back, Alex!</h2>
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          Here's a quick overview of your tutoring schedule and progress this week.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg mb-stack-lg">
        <div className="bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed to-transparent opacity-30 z-0" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-stack-md">
              <span className="font-label-caps text-label-caps text-primary tracking-widest uppercase">Next Session</span>
              <span className="bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 rounded-full font-label-caps text-label-caps">In 2 Hours</span>
            </div>
            <h3 className="font-headline-lg text-headline-lg text-on-surface mb-unit">Intro to Data Structures</h3>
            <p className="font-body-md text-body-md text-on-surface-variant mb-stack-md">COMP 201 - Room 402</p>
            <div className="flex items-center gap-stack-sm">
              <span className="material-symbols-outlined text-primary">schedule</span>
              <span className="font-data-mono text-data-mono">14:00 - 15:30</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-stack-lg border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col justify-between">
          <div className="flex justify-between items-start mb-stack-md">
            <span className="font-label-caps text-label-caps text-secondary tracking-widest uppercase">Hours Logged this Week</span>
            <span className="material-symbols-outlined text-secondary">trending_up</span>
          </div>
          <div>
            <div className="flex items-baseline gap-unit mb-unit">
              <span className="font-display text-display text-on-surface">12.5</span>
              <span className="font-body-lg text-body-lg text-on-surface-variant">/ 15 hrs</span>
            </div>
            <div className="w-full bg-surface-container-high rounded-full h-2 mb-stack-sm">
              <div className="bg-secondary h-2 rounded-full" style={{ width: "83%" }} />
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">You're on track to meet your weekly requirement!</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-lg">
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col h-full">
          <div className="p-stack-lg border-b border-outline-variant flex justify-between items-center">
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface">Weekly Schedule</h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant">Assigned Sessions for Oct 12 - Oct 18</p>
            </div>
            <button className="text-primary hover:bg-primary-fixed px-4 py-2 rounded-lg font-label-caps text-label-caps transition-colors border border-primary">
              Sync Calendar
            </button>
          </div>
          <div className="p-stack-sm flex-1 overflow-x-auto">
            <div className="min-w-[600px] grid grid-cols-6 gap-unit">
              <div className="text-center font-label-caps text-label-caps text-on-surface-variant py-2">Time</div>
              {["Mon", "Tue", "Wed"].map((d) => (
                <div key={d} className="text-center font-label-caps text-label-caps text-on-surface-variant py-2">{d}</div>
              ))}
              <div className="text-center font-label-caps text-label-caps text-primary py-2 border-b-2 border-primary">Thu (Today)</div>
              <div className="text-center font-label-caps text-label-caps text-on-surface-variant py-2">Fri</div>

              <div className="font-data-mono text-data-mono text-on-surface-variant text-right pr-2 py-4 border-t border-outline-variant">10:00</div>
              <div className="col-span-5 border-t border-outline-variant relative">
                <div className="absolute top-2 left-[20%] w-[18%] bg-primary-fixed border border-primary rounded p-2 shadow-sm">
                  <p className="font-label-caps text-label-caps text-primary mb-1">COMP 101</p>
                  <p className="font-body-sm text-body-sm text-on-surface">Lab A</p>
                </div>
              </div>

              <div className="font-data-mono text-data-mono text-on-surface-variant text-right pr-2 py-4 border-t border-outline-variant">12:00</div>
              <div className="col-span-5 border-t border-outline-variant relative">
                <div className="absolute top-2 left-[40%] w-[18%] bg-secondary-fixed border border-secondary rounded p-2 shadow-sm">
                  <p className="font-label-caps text-label-caps text-secondary mb-1">Office Hrs</p>
                  <p className="font-body-sm text-body-sm text-on-surface">Online</p>
                </div>
              </div>

              <div className="font-data-mono text-data-mono text-on-surface-variant text-right pr-2 py-4 border-t border-outline-variant">14:00</div>
              <div className="col-span-5 border-t border-outline-variant relative h-24">
                <div className="absolute top-2 left-[60%] w-[18%] bg-tertiary-fixed border border-tertiary rounded p-2 shadow-sm z-10 ring-2 ring-tertiary ring-offset-2">
                  <p className="font-label-caps text-label-caps text-tertiary mb-1">COMP 201</p>
                  <p className="font-body-sm text-body-sm text-on-surface">Room 402</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-stack-lg">
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-stack-lg shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-stack-md">Quick Actions</h3>
            <div className="space-y-stack-sm">
              <button className="w-full flex items-center justify-between p-stack-sm bg-error-container text-on-error-container hover:bg-[#ffb4ab] transition-colors rounded-lg border border-error">
                <span className="font-body-md text-body-md font-semibold">Excuse from Session</span>
                <span className="material-symbols-outlined">event_busy</span>
              </button>
              <button className="w-full flex items-center justify-between p-stack-sm bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim transition-colors rounded-lg border border-secondary">
                <span className="font-body-md text-body-md font-semibold">Request More Hours</span>
                <span className="material-symbols-outlined">more_time</span>
              </button>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-stack-lg shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <h3 className="font-headline-md text-headline-md text-on-surface mb-unit">Submit Timesheet</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-stack-md">
              Review your logged hours for this pay period before submitting.
            </p>
            <div className="bg-surface-container-low rounded-lg p-stack-md mb-stack-md border border-outline-variant">
              <div className="flex justify-between items-center mb-unit">
                <span className="font-body-md text-body-md text-on-surface-variant">Logged:</span>
                <span className="font-data-mono text-data-mono text-primary font-bold">12.5 hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-md text-body-md text-on-surface-variant">Required/Max:</span>
                <span className="font-data-mono text-data-mono text-on-surface">15.0 hrs</span>
              </div>
            </div>
            <button className="w-full bg-primary text-on-primary font-body-md font-bold py-stack-sm rounded-lg hover:bg-primary-container transition-colors shadow-md">
              Submit Timesheet
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
