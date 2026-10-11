import Button from '../../components/button/Button';

/**
 * TimesheetsContent
 * The presentational body of the Timesheets page (heading, table, empty and
 * loading states). It owns no data and does no navigation: the real
 * Timesheets page feeds it live data inside AppLayout, while the landing
 * page's DashboardPreview feeds it sample data.
 */

const STATUS_STYLES = {
  DRAFT: 'bg-surface-variant text-on-surface-variant',
  SUBMITTED: 'bg-trust-blue/10 text-trust-blue',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-error/10 text-error',
};

const formatDate = (iso) => new Date(iso).toLocaleDateString();

const noop = () => {};

export default function TimesheetsContent({
  isTutor = false,
  isLecturer = false,
  timesheets = [],
  isLoading = false,
  loaded = true,
  onCreate = noop,
  // Called with (timesheet, editable) when the row button is pressed.
  onOpen = noop,
}) {
  return (
    <div className="p-gutter md:p-margin-page space-y-gutter">
      <div className="mb-stack-lg flex flex-wrap items-center justify-between gap-gutter">
        <div>
          <h2 className="font-display text-display text-primary">Timesheets</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            {isTutor
              ? 'Track your tutoring hours and submit them for approval.'
              : 'Review and sign off submitted timesheets.'}
          </p>
        </div>
        <div>
          {isTutor && (
            <Button className="min-w-40" onClick={onCreate}>
              Create Timesheet
            </Button>
          )}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl border border-surface-variant shadow-sm p-stack-md">
        {isLoading && !loaded ? (
          <div className="space-y-stack-sm py-stack-sm" aria-hidden="true">
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="animate-pulse flex flex-wrap items-center gap-x-stack-md gap-y-unit px-stack-md py-stack-sm"
              >
                <div className="h-4 w-28 rounded bg-surface-container-high" />
                <div className="h-4 w-24 rounded bg-surface-container-high/60" />
                <div className="h-4 w-24 rounded bg-surface-container-high/60" />
                <div className="h-4 w-16 rounded bg-surface-container-high/60" />
                <div className="h-6 w-24 rounded bg-surface-container-high ml-auto" />
              </div>
            ))}
          </div>
        ) : timesheets.length === 0 ? (
          <p className="font-body-md text-on-surface-variant py-stack-lg text-center">
            {isTutor
              ? 'No timesheets yet. Click "Create Timesheet" to start one.'
              : 'No timesheets are awaiting your review.'}
          </p>
        ) : (
          <table className="responsive-table w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-variant font-label-caps text-label-caps text-on-surface-variant">
                <th className="py-stack-sm px-stack-md">Name</th>
                {isLecturer && <th className="py-stack-sm px-stack-md">Tutor</th>}
                {!isLecturer && <th className="py-stack-sm px-stack-md">Created</th>}
                {!isLecturer && <th className="py-stack-sm px-stack-md">Last Saved</th>}
                <th className="py-stack-sm px-stack-md">Total Hours</th>
                <th className="py-stack-sm px-stack-md">Status</th>
                <th className="py-stack-sm px-stack-md"></th>
              </tr>
            </thead>
            <tbody className="font-body-md">
              {timesheets.map((timesheet) => {
                const editable = timesheet.status === 'DRAFT' || timesheet.status === 'REJECTED';
                return (
                  <tr key={timesheet.id}>
                    <td data-label="Name" className="py-stack-sm px-stack-md font-data-mono text-body-sm">{timesheet.name}</td>
                    {isLecturer && (
                      <td data-label="Tutor" className="py-stack-sm px-stack-md">
                        <span className="cell-stack">
                          <span className="font-semibold text-on-surface">{timesheet.tutorName}</span>
                          <span className="text-on-surface-variant text-xs ml-1">{timesheet.tutorEmail}</span>
                        </span>
                      </td>
                    )}
                    {!isLecturer && (
                      <td data-label="Created" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(timesheet.createdAt)}
                      </td>
                    )}
                    {!isLecturer && (
                      <td data-label="Last Saved" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                        {formatDate(timesheet.updatedAt)}
                      </td>
                    )}
                    <td data-label="Total Hours" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                      {(timesheet.entries || []).reduce((sum, e) => sum + Number(e.duration || 0), 0)}
                    </td>
                    <td data-label="Status" className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold font-data-mono ${STATUS_STYLES[timesheet.status] || ''}`}
                      >
                        {timesheet.status}
                      </span>
                    </td>
                    <td className="py-stack-sm px-stack-md font-data-mono text-body-sm">
                      <Button
                        className="min-w-24 max-h-8 text-[11px]"
                        onClick={() => onOpen(timesheet, editable)}
                      >
                        {editable ? 'Continue Editing' : 'View'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
