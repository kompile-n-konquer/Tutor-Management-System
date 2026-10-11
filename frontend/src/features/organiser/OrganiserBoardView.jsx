/**
 * OrganiserBoardView
 * The presentational body of the organiser allocation board: the course list,
 * the board header and the two tutor pools. It owns no data and no side
 * effects. The real Organiser page feeds it live state and handlers; the
 * landing page's DashboardPreview feeds it sample data with `readOnly` set,
 * which makes the board static (no drag, no focus, no buttons that do
 * anything) and a little more compact so it fits inside the preview window.
 */

const noop = () => {};
const EMPTY_REFS = { current: {} };
const NO_FOCUS = { pool: null, index: -1 };

function TutorCard({ tutor, cardRef, isFocused, onKeyDown, onFocus, onDragStart, onRemove, isMutating, readOnly }) {
  const clashClasses = tutor.clash
    ? "bg-clash-bg/10 border-2 border-clash-bg"
    : "bg-surface-container-lowest border border-surface-variant";
  return (
    <div
      ref={cardRef}
      tabIndex={!readOnly && isFocused ? 0 : -1}
      role={readOnly ? undefined : "button"}
      aria-label={
        readOnly ? undefined : `${tutor.name}. Press Enter to move between pools, Delete to remove.`
      }
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      draggable={!readOnly}
      onDragStart={onDragStart}
      className={`${clashClasses} p-stack-sm rounded ${
        readOnly ? "" : "cursor-grab hover:shadow-sm"
      } transition-shadow flex items-start gap-stack-sm relative group outline-none ${
        isFocused ? "ring-2 ring-primary ring-offset-1" : ""
      } ${isMutating ? "opacity-50 pointer-events-none" : ""}`}
    >
      {tutor.clash && (
        <div className="absolute -top-2 -right-2 bg-clash-bg text-on-clash-bg rounded-full p-1 shadow-sm">
          <span className="material-symbols-outlined text-[16px]">error</span>
        </div>
      )}
      {onRemove && (
        <button
          className="absolute -top-1.5 -right-1.5 bg-urgent-orange text-on-urgent-orange rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-sm hover:bg-urgent-orange/80 z-10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(tutor);
          }}
          tabIndex={isFocused ? 0 : -1}
          title="Remove tutor"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
      )}
      <div
        className={`w-10 h-10 rounded-full bg-surface-variant overflow-hidden shrink-0 border ${
          tutor.clash ? "border-clash-bg" : "border-outline-variant"
        }`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <h4 className="font-body-md font-bold text-on-surface truncate">{tutor.name}</h4>
          {tutor.verified ? (
            <span className="font-data-mono text-data-mono text-xs text-trust-blue bg-trust-blue/10 px-1 rounded border border-trust-blue/20">
              Verified
            </span>
          ) : null}
        </div>
        <div className="flex gap-stack-md mt-unit">
          {tutor.courseMark != null && (
            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">school</span> {tutor.courseMark}%
            </span>
          )}
          <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">badge</span> {tutor.applicationStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

function Pool({
  id,
  label,
  count,
  tutors,
  cardRefs,
  focus,
  onCardKeyDown,
  onCardFocus,
  onDragStart,
  onDragOver,
  onDrop,
  highlighted,
  onRemove,
  mutatingId,
  readOnly,
}) {
  return (
    <div className="w-full md:w-1/2 flex flex-col bg-surface-container-low rounded-lg border border-outline-variant/50">
      <div className="p-stack-sm border-b border-outline-variant/50 flex justify-between items-center gap-2">
        <span className="font-label-caps text-label-caps text-on-surface-variant truncate">{label}</span>
        <span className="font-data-mono text-data-mono bg-surface-variant px-2 rounded shrink-0">{count}</span>
      </div>
      <div
        onDragOver={(e) => onDragOver(e, id)}
        onDrop={(e) => onDrop(e, id)}
        className={`flex-1 overflow-y-auto custom-scrollbar p-stack-sm space-y-stack-sm ${
          highlighted === id ? "drag-over rounded" : ""
        }`}
      >
        {tutors.length === 0 && (
          <p className="text-center font-body-sm text-on-surface-variant py-stack-lg">No tutors here yet.</p>
        )}
        {tutors.map((t, index) => (
          <TutorCard
            key={t.id}
            tutor={t}
            cardRef={(node) => {
              cardRefs.current[`${id}-${index}`] = node;
            }}
            isFocused={focus.pool === id && focus.index === index}
            onKeyDown={(e) => onCardKeyDown(e, id, index)}
            onFocus={() => onCardFocus(id, index)}
            onDragStart={(e) => onDragStart(e, t.id)}
            onRemove={id === "allocated" && !readOnly ? onRemove : null}
            isMutating={t.applicantId === mutatingId}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

export default function OrganiserBoardView({
  courses = [],
  selectedCourse = null,
  onSelectCourse = noop,
  coursesLoading = false,
  loading = false,
  fetchError = null,
  course,
  availableTutors = [],
  allocatedTutors = [],
  autoAssigning = false,
  onAutoAssign = noop,
  cardRefs = EMPTY_REFS,
  focus = NO_FOCUS,
  onCardKeyDown = noop,
  onCardFocus = noop,
  onDragStart = noop,
  onDragOver = noop,
  onDrop = noop,
  dragOverPool = null,
  onRemove = noop,
  mutatingId = null,
  // Preview mode: static, non-interactive and compact.
  readOnly = false,
}) {
  const poolProps = {
    cardRefs,
    focus,
    onCardKeyDown,
    onCardFocus,
    onDragStart,
    onDragOver,
    onDrop,
    highlighted: dragOverPool,
    mutatingId,
    readOnly,
  };

  return (
    <div
      className={`flex flex-col md:flex-row h-full ${
        readOnly ? "p-stack-md gap-stack-md" : "p-stack-md md:p-margin-page gap-gutter"
      }`}
    >
      {/* Course list — full width with its own scroll on phones so the board
          below stays reachable; docked column from md up. */}
      <div
        className={`${
          readOnly ? "w-full md:w-56" : "w-full md:w-80"
        } flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden shrink-0 ${
          readOnly ? "max-h-56 md:max-h-none" : "max-h-[45vh] md:max-h-none"
        }`}
      >
        <div className="p-stack-md border-b border-surface-variant bg-surface flex justify-between items-center">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">Courses</h2>
            <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">Select to allocate</p>
          </div>
          <button
            tabIndex={readOnly ? -1 : undefined}
            className="text-primary hover:bg-primary-fixed p-unit rounded transition-colors"
          >
            <span className="material-symbols-outlined">filter_list</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-stack-sm space-y-stack-sm">
          {coursesLoading &&
            [0, 1, 2].map((card) => (
              <div
                key={card}
                className="animate-pulse p-stack-md rounded-lg border border-surface-variant bg-surface-container-lowest"
              >
                <div className="flex justify-between items-start mb-stack-sm">
                  <div className="h-5 w-24 rounded bg-surface-container-high" />
                  <div className="h-5 w-12 rounded bg-surface-container-high/60" />
                </div>
                <div className="h-4 w-40 rounded bg-surface-container-high/60 mb-stack-sm" />
                <div className="h-1.5 w-full rounded-full bg-surface-container-high/60" />
              </div>
            ))}
          {courses.map((c) => {
            const isActive = c.id === selectedCourse;
            const allocatedCount = c.assignedCount ?? (isActive ? allocatedTutors.length : 0);
            const pct = c.req ? Math.round((allocatedCount / c.req) * 100) : 0;
            const isLow = pct < 50;
            const border = isActive
              ? "border-primary bg-primary-fixed"
              : isLow
                ? "border-urgent-orange/50 bg-secondary-fixed/20 hover:border-urgent-orange"
                : "border-surface-variant bg-surface-container-lowest hover:border-outline";
            return (
              <button
                key={c.code}
                onClick={() => onSelectCourse(c.id)}
                tabIndex={readOnly ? -1 : undefined}
                className={`w-full text-left p-stack-md rounded-lg border ${
                  readOnly ? "cursor-default" : "cursor-pointer"
                } transition-colors ${border}`}
              >
                <div className="flex justify-between items-start mb-stack-sm">
                  <h3
                    className={`font-body-lg text-body-lg font-bold ${isActive ? "text-primary" : "text-on-surface"}`}
                  >
                    {c.code}
                  </h3>
                  <span
                    className={`px-2 py-1 rounded font-data-mono text-data-mono text-xs ${
                      isLow
                        ? "bg-urgent-orange text-on-urgent-orange"
                        : isActive
                          ? "bg-trust-blue text-on-trust-blue"
                          : "bg-surface-variant text-on-surface-variant"
                    }`}
                  >
                    Req: {c.req}
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-stack-sm">{c.name}</p>
                <div className="flex justify-between items-center">
                  <span
                    className={`font-label-caps text-label-caps ${
                      isLow ? "text-urgent-orange" : "text-on-surface-variant"
                    }`}
                  >
                    Allocated: {allocatedCount}
                  </span>
                  <div className="w-full bg-surface-variant rounded-full h-1.5 ml-2">
                    <div
                      className={`h-1.5 rounded-full ${isLow ? "bg-urgent-orange" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-w-0 flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden">
        <div className="p-stack-md border-b border-surface-variant bg-surface flex justify-between items-center flex-wrap gap-2">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">
              {course ? `${course.code} Allocation` : "Loading..."}
            </h2>
            {!readOnly && (
              <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">
                Drag tutors, or use ↑↓ to move, ←→ to switch pools, Enter to assign, Delete to remove, Esc to clear
                focus
              </p>
            )}
          </div>
          <div className="flex gap-stack-sm">
            <button
              onClick={onAutoAssign}
              tabIndex={readOnly ? -1 : undefined}
              disabled={autoAssigning || !course || allocatedTutors.length >= (course?.req ?? 0)}
              className="bg-surface-container-high text-on-surface px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {autoAssigning ? "Assigning…" : "Auto-Assign"}
            </button>
            <button
              tabIndex={readOnly ? -1 : undefined}
              className="bg-primary text-on-primary px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex-1 p-stack-md overflow-hidden flex flex-col md:flex-row gap-stack-lg" aria-hidden="true">
            {[0, 1].map((pool) => (
              <div key={pool} className="flex-1 min-w-0 space-y-stack-sm">
                <div className="animate-pulse h-4 w-40 rounded bg-surface-container-high" />
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="animate-pulse h-14 rounded-lg bg-surface-container-low border border-surface-variant"
                  />
                ))}
              </div>
            ))}
          </div>
        ) : fetchError ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-4xl text-urgent-orange">error</span>
              <p className="font-body-sm text-on-surface-variant mt-stack-sm">{fetchError}</p>
            </div>
          </div>
        ) : !course ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="font-body-sm text-on-surface-variant">
              No courses found. Seed or create a course to get started.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 p-stack-md overflow-hidden flex flex-col md:flex-row gap-stack-lg">
            <Pool
              id="available"
              label={`Available for ${course.code}`}
              count={availableTutors.length}
              tutors={availableTutors}
              {...poolProps}
            />
            <Pool
              id="allocated"
              label={`Assigned to ${course.code}`}
              count={`${allocatedTutors.length}/${course?.req ?? 0}`}
              tutors={allocatedTutors}
              onRemove={onRemove}
              {...poolProps}
            />
          </div>
        )}
      </div>
    </div>
  );
}
