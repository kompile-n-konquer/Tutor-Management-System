import { useEffect, useRef, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import api from "../../utils/axiosInstance";

const MAX_AVAILABLE_TUTORS = 15;

/**
 * Maps a backend course record into the shape the sidebar expects.
 */
function mapApiCourse(c) {
  return {
    id: c.id,
    code: c.courseCode,
    name: c.courseName,
    req: c.requiredTutors,
    budget: c.budgetHours,
    rate: c.hourlyRate,
    assignedCount: c.assignedCount,
  };
}

/**
 * Maps a backend available-tutor record into the shape the board expects.
 * `courseCode` is set to null so the component treats them as "available".
 */
function mapApiTutor(t) {
  return {
    id: `applicant-${t.applicantId}`,
    applicantId: t.applicantId,
    name: t.name,
    email: t.email,
    courseMark: t.courseMark,
    applicationStatus: t.applicationStatus,
    verified: t.applicationStatus === "ACCEPTED",
    clash: false,
    courseCode: null,
  };
}

function TutorCard({ tutor, cardRef, isFocused, onKeyDown, onFocus, onDragStart }) {
  const clashClasses = tutor.clash
    ? "bg-clash-bg/10 border-2 border-clash-bg"
    : "bg-surface-container-lowest border border-surface-variant";
  return (
    <div
      ref={cardRef}
      tabIndex={isFocused ? 0 : -1}
      role="button"
      aria-label={`${tutor.name}. Press Enter to move between pools.`}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      draggable
      onDragStart={onDragStart}
      className={`${clashClasses} p-stack-sm rounded cursor-grab hover:shadow-sm transition-shadow flex items-start gap-stack-sm relative group outline-none ${
        isFocused ? "ring-2 ring-primary ring-offset-1" : ""
      }`}
    >
      {tutor.clash && (
        <div className="absolute -top-2 -right-2 bg-clash-bg text-white rounded-full p-1 shadow-sm">
          <span className="material-symbols-outlined text-[16px]">error</span>
        </div>
      )}
      <div className={`w-10 h-10 rounded-full bg-surface-variant overflow-hidden shrink-0 border ${tutor.clash ? "border-clash-bg" : "border-outline-variant"}`} />
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
          <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">school</span> {tutor.courseMark}%
          </span>
          <span className={`font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1`}>
            <span className="material-symbols-outlined text-[14px]">badge</span> {tutor.applicationStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

function Pool({ id, label, count, tutors, cardRefs, focus, onCardKeyDown, onCardFocus, onDragStart, onDragOver, onDrop, highlighted }) {
  return (
    <div className="w-1/2 flex flex-col bg-surface-container-low rounded-lg border border-outline-variant/50">
      <div className="p-stack-sm border-b border-outline-variant/50 flex justify-between items-center">
        <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
        <span className="font-data-mono text-data-mono bg-surface-variant px-2 rounded">{count}</span>
      </div>
      <div
        onDragOver={(e) => onDragOver(e, id)}
        onDrop={(e) => onDrop(e, id)}
        className={`flex-1 overflow-y-auto custom-scrollbar p-stack-sm space-y-stack-sm ${highlighted === id ? "drag-over rounded" : ""}`}
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
          />
        ))}
      </div>
    </div>
  );
}

export default function Organiser() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [dragOverPool, setDragOverPool] = useState(null);
  const [focus, setFocus] = useState({ pool: "available", index: 0 });
  const cardRefs = useRef({});

  // Fetch courses and available tutors from the backend
  useEffect(() => {
    let cancelled = false;

    async function fetchBoardData() {
      setLoading(true);
      setFetchError(null);
      try {
        const [coursesRes, tutorsRes] = await Promise.all([
          api.get("/courses"),
          api.get("/allocation/available-tutors"),
        ]);
        if (cancelled) return;

        if (coursesRes.status === 200 && coursesRes.data?.courses) {
          const mappedCourses = coursesRes.data.courses.map(mapApiCourse);
          setCourses(mappedCourses);
          // Auto-select the first course
          if (mappedCourses.length > 0) {
            setSelectedCourse(mappedCourses[0].code);
          }
        }

        if (tutorsRes.status === 200 && tutorsRes.data?.availableTutors) {
          const mapped = tutorsRes.data.availableTutors
            .slice(0, MAX_AVAILABLE_TUTORS)
            .map(mapApiTutor);
          setTutors(mapped);
        }
      } catch (err) {
        if (!cancelled) setFetchError(err.message || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchBoardData();
    return () => { cancelled = true; };
  }, []);

  const course = courses.find((c) => c.code === selectedCourse);
  const available = tutors.filter((t) => t.courseCode === null);
  const allocated = tutors.filter((t) => t.courseCode === selectedCourse);
  const pools = { available, allocated };

  // Switching courses changes what "allocated" means, so reset focus to somewhere valid
  useEffect(() => {
    setFocus({ pool: "available", index: 0 });
  }, [selectedCourse]);

  // Keep the roving-tabindex target in bounds whenever a pool's length changes
  // (e.g. after an assignment shrinks the "available" list)
  useEffect(() => {
    const list = pools[focus.pool];
    if (focus.index > list.length - 1) {
      setFocus((f) => ({ ...f, index: Math.max(list.length - 1, 0) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.length, allocated.length]);

  // Move actual DOM focus to match `focus` state after every render
  useEffect(() => {
    const key = `${focus.pool}-${focus.index}`;
    cardRefs.current[key]?.focus();
  }, [focus, available.length, allocated.length]);

  function moveTutor(tutorId, fromPool) {
    setTutors((prev) =>
      prev.map((t) =>
        t.id === tutorId ? { ...t, courseCode: fromPool === "available" ? selectedCourse : null } : t
      )
    );
  }

  function handleCardKeyDown(e, pool, index) {
    const list = pools[pool];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocus({ pool, index: Math.min(index + 1, list.length - 1) });
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocus({ pool, index: Math.max(index - 1, 0) });
        break;
      case "ArrowRight":
      case "ArrowLeft": {
        e.preventDefault();
        const otherPool = pool === "available" ? "allocated" : "available";
        const otherList = pools[otherPool];
        setFocus({ pool: otherPool, index: Math.min(index, Math.max(otherList.length - 1, 0)) });
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const tutor = list[index];
        if (tutor) moveTutor(tutor.id, pool);
        break;
      }
      case "Escape":
        e.currentTarget.blur();
        break;
      default:
        break;
    }
  }

  function handleCardFocus(pool, index) {
    setFocus({ pool, index });
  }

  function handleDragStartMouse(e, tutorId) {
    e.dataTransfer.setData("text/plain", tutorId);
  }
  function handleDragOver(e, poolId) {
    e.preventDefault();
    setDragOverPool(poolId);
  }
  function handleDrop(e, poolId) {
    e.preventDefault();
    setDragOverPool(null);
    const tutorId = e.dataTransfer.getData("text/plain");
    const draggedTutor = tutors.find((t) => t.id === tutorId);
    if (!draggedTutor) return;
    const fromPool = draggedTutor.courseCode === null ? "available" : "allocated";
    if (fromPool !== poolId) moveTutor(tutorId, fromPool);
  }

  return (
    <AppLayout role="tutor" title="Tutor Management System">
      <div className="p-stack-md md:p-margin-page flex gap-gutter h-full">
        {/* Course list */}
        <div className="w-80 flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden shrink-0">
          <div className="p-stack-md border-b border-surface-variant bg-surface flex justify-between items-center">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">Courses</h2>
              <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">Select to allocate</p>
            </div>
            <button className="text-primary hover:bg-primary-fixed p-unit rounded transition-colors">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-stack-sm space-y-stack-sm">
            {courses.map((c) => {
              const isActive = c.code === selectedCourse;
              const allocatedCount = c.assignedCount ?? tutors.filter((t) => t.courseCode === c.code).length;
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
                  onClick={() => setSelectedCourse(c.code)}
                  className={`w-full text-left p-stack-md rounded-lg border cursor-pointer transition-colors ${border}`}
                >
                  <div className="flex justify-between items-start mb-stack-sm">
                    <h3 className={`font-body-lg text-body-lg font-bold ${isActive ? "text-primary" : "text-on-surface"}`}>{c.code}</h3>
                    <span
                      className={`px-2 py-1 rounded font-data-mono text-data-mono text-xs text-white ${
                        isLow ? "bg-urgent-orange" : isActive ? "bg-trust-blue" : "bg-surface-variant text-on-surface-variant"
                      }`}
                    >
                      Req: {c.req}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-stack-sm">{c.name}</p>
                  <div className="flex justify-between items-center">
                    <span className={`font-label-caps text-label-caps ${isLow ? "text-urgent-orange" : "text-on-surface-variant"}`}>
                      Allocated: {allocatedCount}
                    </span>
                    <div className="w-full bg-surface-variant rounded-full h-1.5 ml-2">
                      <div className={`h-1.5 rounded-full ${isLow ? "bg-urgent-orange" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-stack-md border-b border-surface-variant bg-surface flex justify-between items-center flex-wrap gap-2">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">
                {course ? `${course.code} Allocation` : "Loading..."}
              </h2>
              <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">
                Drag tutors, or use ↑↓ to move, ←→ to switch pools, Enter to assign, Esc to clear focus
              </p>
            </div>
            <div className="flex gap-stack-sm">
              <button className="bg-surface-container-high text-on-surface px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:bg-surface-variant transition-colors">
                Auto-Assign
              </button>
              <button className="bg-primary text-white px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity">
                Save Changes
              </button>
            </div>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                <p className="font-body-sm text-on-surface-variant mt-stack-sm">Loading available tutors...</p>
              </div>
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
              <p className="font-body-sm text-on-surface-variant">No courses found. Seed or create a course to get started.</p>
            </div>
          ) : (
            <div className="flex-1 p-stack-md overflow-hidden flex gap-stack-lg">
              <Pool
                id="available"
                label="Available Tutors"
                count={available.length}
                tutors={available}
                cardRefs={cardRefs}
                focus={focus}
                onCardKeyDown={handleCardKeyDown}
                onCardFocus={handleCardFocus}
                onDragStart={handleDragStartMouse}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                highlighted={dragOverPool}
              />
              <Pool
                id="allocated"
                label={`Assigned to ${course?.code ?? "…"}`}
                count={`${allocated.length}/${course?.req ?? 0}`}
                tutors={allocated}
                cardRefs={cardRefs}
                focus={focus}
                onCardKeyDown={handleCardKeyDown}
                onCardFocus={handleCardFocus}
                onDragStart={handleDragStartMouse}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                highlighted={dragOverPool}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
