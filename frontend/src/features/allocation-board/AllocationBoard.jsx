import { useState } from "react";
import AppLayout from "../../components/layout/AppLayout";

const COURSES = [
  { code: "CS101", name: "Intro to Programming", req: 5, allocated: 3, urgency: "trust" },
  { code: "MATH202", name: "Discrete Mathematics", req: 2, allocated: 0, urgency: "none" },
  { code: "CS305", name: "Database Systems", req: 4, allocated: 1, urgency: "urgent" },
];

const INITIAL_AVAILABLE = [
  { id: "t1", name: "Alex Mercer", rating: 4.8, hoursLeft: 15, verified: true, clash: false },
  { id: "t2", name: "Sarah Jenkins", rating: 4.5, hoursLeft: 2, verified: true, clash: false },
];

const INITIAL_ALLOCATED = [{ id: "t3", name: "David Kim", rating: 4.9, hoursLeft: 8, verified: true, clash: true }];

function TutorCard({ tutor, onDragStart }) {
  const clashClasses = tutor.clash
    ? "bg-clash-bg/10 border-2 border-clash-bg"
    : "bg-surface-container-lowest border border-surface-variant";
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, tutor.id)}
      className={`${clashClasses} p-stack-sm rounded cursor-grab hover:shadow-sm transition-shadow flex items-start gap-stack-sm relative group`}
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
          {tutor.clash ? (
            <span className="font-data-mono text-data-mono text-xs text-clash-bg bg-clash-bg/10 px-1 rounded border border-clash-bg/20">
              Schedule Clash
            </span>
          ) : tutor.verified ? (
            <span className="font-data-mono text-data-mono text-xs text-trust-blue bg-trust-blue/10 px-1 rounded border border-trust-blue/20">
              Verified
            </span>
          ) : null}
        </div>
        <div className="flex gap-stack-md mt-unit">
          <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">star</span> {tutor.rating}
          </span>
          <span className={`font-label-caps text-label-caps flex items-center gap-1 ${tutor.hoursLeft <= 3 ? "text-urgent-orange" : "text-on-surface-variant"}`}>
            <span className="material-symbols-outlined text-[14px]">schedule</span> {tutor.hoursLeft}h left
          </span>
        </div>
      </div>
    </div>
  );
}

function Pool({ id, label, count, tutors, onDragStart, onDragOver, onDrop, highlighted }) {
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
        {tutors.map((t) => (
          <TutorCard key={t.id} tutor={t} onDragStart={onDragStart} />
        ))}
      </div>
    </div>
  );
}

export default function AllocationBoard() {
  const [selectedCourse, setSelectedCourse] = useState(COURSES[0].code);
  const [available, setAvailable] = useState(INITIAL_AVAILABLE);
  const [allocated, setAllocated] = useState(INITIAL_ALLOCATED);
  const [dragOverPool, setDragOverPool] = useState(null);

  function handleDragStart(e, tutorId) {
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

    const fromAvailable = available.find((t) => t.id === tutorId);
    const fromAllocated = allocated.find((t) => t.id === tutorId);

    if (poolId === "allocated" && fromAvailable) {
      setAvailable((prev) => prev.filter((t) => t.id !== tutorId));
      setAllocated((prev) => [...prev, fromAvailable]);
    } else if (poolId === "available" && fromAllocated) {
      setAllocated((prev) => prev.filter((t) => t.id !== tutorId));
      setAvailable((prev) => [...prev, fromAllocated]);
    }
  }

  const course = COURSES.find((c) => c.code === selectedCourse);

  return (
    <AppLayout role="tutor" title="Allocation Board" showSearch={true}>
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
            {COURSES.map((c) => {
              const isActive = c.code === selectedCourse;
              const pct = c.req ? Math.round((c.allocated / c.req) * 100) : 0;
              const border = isActive
                ? "border-primary bg-primary-fixed"
                : c.urgency === "urgent"
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
                        c.urgency === "urgent" ? "bg-urgent-orange" : isActive ? "bg-trust-blue" : "bg-surface-variant text-on-surface-variant"
                      }`}
                    >
                      Req: {c.req}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-stack-sm">{c.name}</p>
                  <div className="flex justify-between items-center">
                    <span className={`font-label-caps text-label-caps ${c.urgency === "urgent" ? "text-urgent-orange" : "text-on-surface-variant"}`}>
                      Allocated: {c.allocated}
                    </span>
                    <div className="w-full bg-surface-variant rounded-full h-1.5 ml-2">
                      <div className={`h-1.5 rounded-full ${c.urgency === "urgent" ? "bg-urgent-orange" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden">
          <div className="p-stack-md border-b border-surface-variant bg-surface flex justify-between items-center">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">{course.code} Allocation</h2>
              <p className="font-label-caps text-label-caps text-on-surface-variant mt-unit">Drag tutors to assign</p>
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
          <div className="flex-1 p-stack-md overflow-hidden flex gap-stack-lg">
            <Pool
              id="available"
              label="Available Tutors"
              count={available.length}
              tutors={available}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              highlighted={dragOverPool}
            />
            <Pool
              id="allocated"
              label={`Assigned to ${course.code}`}
              count={`${allocated.length}/${course.req}`}
              tutors={allocated}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              highlighted={dragOverPool}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}