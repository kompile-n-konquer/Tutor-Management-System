import { useEffect, useRef, useState } from "react";
import AppLayout from "../../components/layout/AppLayout";
import api from "../../utils/axiosInstance";
import { useAuth } from "../context/AuthContext";
import {
  connectOrganiserSocket,
  getOrganiserSocket,
  disconnectOrganiserSocket,
} from "../../utils/socket";

const MAX_AVAILABLE_TUTORS = 15;

/**
 * Maps a backend course record into the shape the sidebar expects.
 * GET /courses returns a plain array with tutorsRequired/assignedTutors.
 */
function mapApiCourse(c) {
  return {
    id: c.id,
    code: c.courseCode,
    name: c.courseName,
    req: c.tutorsRequired,
    assignedCount: c.assignedTutors,
  };
}

/**
 * Maps a backend available-tutor record into the shape the board expects.
 * These are applicants who applied to tutor the currently selected course.
 */
function mapApiTutor(t) {
  return {
    id: `applicant-${t.applicantId}`,
    applicantId: t.applicantId,
    name: t.name,
    email: t.email,
    courseId: t.courseId,
    courseMark: t.courseMark,
    applicationStatus: t.applicationStatus,
    verified: t.applicationStatus === "ACCEPTED",
    clash: false,
  };
}

/**
 * Maps a backend assigned-tutor record into the board shape.
 */
function mapApiAssignedTutor(t) {
  return {
    id: `assigned-${t.assignmentId}`,
    applicantId: t.applicantId,
    assignmentId: t.assignmentId,
    name: t.name,
    email: t.email,
    courseId: t.courseId,
    courseMark: null,
    applicationStatus: t.status || "ASSIGNED",
    verified: t.status === "ACCEPTED",
    clash: false,
    courseCode: t.courseCode,
  };
}

function TutorCard({ tutor, cardRef, isFocused, onKeyDown, onFocus, onDragStart, onDragEnd, onRemove, isMutating, draggedBy }) {
  const clashClasses = tutor.clash
    ? "bg-clash-bg/10 border-2 border-clash-bg"
    : draggedBy
    ? "bg-secondary-fixed/40 border-2 border-urgent-orange"
    : "bg-surface-container-lowest border border-surface-variant";
  return (
    <div
      ref={cardRef}
      tabIndex={isFocused ? 0 : -1}
      role="button"
      aria-label={`${tutor.name}. Press Enter to move between pools, Delete to remove.`}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`${clashClasses} p-stack-sm rounded cursor-grab hover:shadow-sm transition-shadow flex items-start gap-stack-sm relative group outline-none ${
        isFocused ? "ring-2 ring-primary ring-offset-1" : ""
      } ${isMutating ? "opacity-50 pointer-events-none" : ""}`}
    >
      {draggedBy && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-urgent-orange text-on-urgent-orange font-label-caps text-label-caps text-[10px] px-2 py-0.5 rounded-full shadow whitespace-nowrap z-10 flex items-center gap-1">
          <span className="material-symbols-outlined text-[12px]">drag_pan</span>
          {draggedBy}
        </div>
      )}
      {tutor.clash && (
        <div className="absolute -top-2 -right-2 bg-clash-bg text-on-clash-bg rounded-full p-1 shadow-sm">
          <span className="material-symbols-outlined text-[16px]">error</span>
        </div>
      )}
      {onRemove && (
        <button
          className="absolute -top-1.5 -right-1.5 bg-urgent-orange text-on-urgent-orange rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-sm hover:bg-urgent-orange/80 z-10"
          onClick={(e) => { e.stopPropagation(); onRemove(tutor); }}
          tabIndex={isFocused ? 0 : -1}
          title="Remove tutor"
        >
          <span className="material-symbols-outlined text-[14px]">close</span>
        </button>
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
          {tutor.courseMark != null && (
            <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">school</span> {tutor.courseMark}%
            </span>
          )}
          <span className={`font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1`}>
            <span className="material-symbols-outlined text-[14px]">badge</span> {tutor.applicationStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

function Pool({ id, label, count, tutors, cardRefs, focus, onCardKeyDown, onCardFocus, onDragStart, onDragEnd, onDragOver, onDrop, highlighted, onRemove, mutatingId, remoteDrag }) {
  return (
    <div className="w-full md:w-1/2 flex flex-col bg-surface-container-low rounded-lg border border-outline-variant/50">
      <div className="p-stack-sm border-b border-outline-variant/50 flex justify-between items-center">
        <span className="font-label-caps text-label-caps text-on-surface-variant">{label}</span>
        {remoteDrag && remoteDrag.pool === id ? (
          <span className="font-label-caps text-label-caps text-[10px] text-urgent-orange flex items-center gap-1 animate-pulse">
            <span className="material-symbols-outlined text-[12px]">south</span>
            {remoteDrag.name}
          </span>
        ) : (
          <span className="font-data-mono text-data-mono bg-surface-variant px-2 rounded">{count}</span>
        )}
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
            onDragEnd={() => onDragEnd()}
            onRemove={id === "allocated" ? onRemove : null}
            isMutating={t.applicantId === mutatingId}
            draggedBy={
              remoteDrag && remoteDrag.applicantId === t.applicantId ? remoteDrag.name : null
            }
          />
        ))}
      </div>
    </div>
  );
}

export default function Organiser() {
  const { currentUser, role, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [availableTutors, setAvailableTutors] = useState([]);
  const [allocatedTutors, setAllocatedTutors] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [poolsLoading, setPoolsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [dragOverPool, setDragOverPool] = useState(null);
  const [mutatingId, setMutatingId] = useState(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [focus, setFocus] = useState({ pool: "available", index: 0 });
  const [notice, setNotice] = useState(null);
  const [remoteDrag, setRemoteDrag] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState(null);
  const [onlineOrganisers, setOnlineOrganisers] = useState([]);
  const cardRefs = useRef({});
  const draggingRef = useRef(null);
  const lastDragPoolRef = useRef(null);
  // Refs so socket handlers always read the latest course selection without
  // re-registering the listeners on every change.
  const selectedCourseRef = useRef(null);
  const userIdRef = useRef(null);

  selectedCourseRef.current = selectedCourse;
  userIdRef.current = currentUser?.id ?? null;

  const isOrganiser = role === "organiser" || role === "admin";

  // Live collaboration: every connected organiser sees each other's drags and
  // board changes. The socket only admits ORGANISER/ADMIN (server-side).
  useEffect(() => {
    if (!isOrganiser) return undefined;

    const socket = connectOrganiserSocket();

    const onDrag = (payload) => {
      if (payload?.userId === userIdRef.current) return;
      setRemoteDrag(payload);
    };
    const onDragEnd = (payload) => {
      setRemoteDrag((current) =>
        current && (!payload || current.userId === payload.userId) ? null : current,
      );
    };
    const onAllocationChanged = (payload) => {
      if (payload?.actorId === userIdRef.current) return;
      setLiveUpdate({ name: payload?.actorName ?? "Another organiser", type: payload?.type });
      refetchCourses();
      if (payload?.courseId === selectedCourseRef.current) {
        refetchPools(selectedCourseRef.current);
      }
    };
    const onPresence = (payload) => {
      setOnlineOrganisers(payload?.organisers ?? []);
    };

    socket.on("presence:drag", onDrag);
    socket.on("presence:drag-end", onDragEnd);
    socket.on("allocation:changed", onAllocationChanged);
    socket.on("presence:list", onPresence);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("presence:drag", onDrag);
      socket.off("presence:drag-end", onDragEnd);
      socket.off("allocation:changed", onAllocationChanged);
      socket.off("presence:list", onPresence);
      disconnectOrganiserSocket();
    };
  }, [isOrganiser]);

  // "Alex Mercer is dragging Priya Nair" style hint that fades after a moment
  useEffect(() => {
    if (!liveUpdate) return undefined;
    const timer = setTimeout(() => setLiveUpdate(null), 4000);
    return () => clearTimeout(timer);
  }, [liveUpdate]);

  const loading = coursesLoading || poolsLoading;
  const course = courses.find((c) => c.id === selectedCourse);
  const pools = { available: availableTutors, allocated: allocatedTutors };

  // Fetch the course list once Firebase has restored the session, and again
  // whenever the Try again button bumps reloadKey after a failed load.
  useEffect(() => {
    // Wait for auth to settle before the first fetch — the axios interceptor
    // reads auth.currentUser at request time and would otherwise send the
    // request without a token (401 on hard refresh).
    if (authLoading || !currentUser?.uid) return;
    let cancelled = false;

    async function fetchCourses() {
      setCoursesLoading(true);
      setFetchError(null);
      try {
        const coursesRes = await api.get("/courses");
        if (cancelled) return;

        if (coursesRes.status === 200 && Array.isArray(coursesRes.data)) {
          const mappedCourses = coursesRes.data.map(mapApiCourse);
          setCourses(mappedCourses);
          // Auto-select the first course on initial load only
          if (mappedCourses.length > 0 && selectedCourse == null) {
            setSelectedCourse(mappedCourses[0].id);
          }
        } else {
          setFetchError(
            coursesRes?.data?.message ||
              coursesRes?.data?.error ||
              "Could not load the courses. Please try again."
          );
        }
      } catch (err) {
        if (!cancelled) setFetchError(err.message || "Network error");
      } finally {
        if (!cancelled) setCoursesLoading(false);
      }
    }

    fetchCourses();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, currentUser?.uid, reloadKey]);

  // Fetch the tutor pools for the selected course. Each course has its own
  // available list (the applicants who applied to tutor that course) and its
  // own assigned list, so both are filtered by courseId server-side.
  useEffect(() => {
    if (selectedCourse == null) return;
    let cancelled = false;

    async function fetchPools() {
      setPoolsLoading(true);
      setFetchError(null);
      // Clear stale pools from the previously selected course
      setAvailableTutors([]);
      setAllocatedTutors([]);
      try {
        const [availableRes, assignedRes] = await Promise.all([
          api.get("/allocation/available-tutors", { params: { courseId: selectedCourse } }),
          api.get("/allocation/assignments", { params: { courseId: selectedCourse } }),
        ]);
        if (cancelled) return;

        if (availableRes.status !== 200 || assignedRes.status !== 200) {
          setFetchError(
            availableRes?.data?.message ||
              availableRes?.data?.error ||
              "Could not load the tutors for this course. Please try again."
          );
          return;
        }

        setAvailableTutors(
          availableRes.data?.availableTutors
            ? availableRes.data.availableTutors.slice(0, MAX_AVAILABLE_TUTORS).map(mapApiTutor)
            : [],
        );

        setAllocatedTutors(
          assignedRes.data?.assignedTutors
            ? assignedRes.data.assignedTutors.map(mapApiAssignedTutor)
            : [],
        );
      } catch (err) {
        if (!cancelled) setFetchError(err.message || "Network error");
      } finally {
        if (!cancelled) setPoolsLoading(false);
      }
    }

    fetchPools();
    return () => { cancelled = true; };
  }, [selectedCourse, reloadKey]);

  // Refetch tutor pools after mutations (courses stay stable)
  async function refetchPools(courseId) {
    try {
      const [availableRes, assignedRes] = await Promise.all([
        api.get("/allocation/available-tutors", { params: { courseId } }),
        api.get("/allocation/assignments", { params: { courseId } }),
      ]);

      setAvailableTutors(
        availableRes.status === 200 && availableRes.data?.availableTutors
          ? availableRes.data.availableTutors.slice(0, MAX_AVAILABLE_TUTORS).map(mapApiTutor)
          : [],
      );

      setAllocatedTutors(
        assignedRes.status === 200 && assignedRes.data?.assignedTutors
          ? assignedRes.data.assignedTutors.map(mapApiAssignedTutor)
          : [],
      );
    } catch {
      // Silently fall back to the optimistic state
    }
  }

  // Refresh course cards so allocated counts / progress bars stay accurate
  async function refetchCourses() {
    try {
      const res = await api.get("/courses");
      if (res.status === 200 && Array.isArray(res.data)) {
        setCourses(res.data.map(mapApiCourse));
      }
    } catch {
      // Keep the current sidebar counts
    }
  }

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
  }, [availableTutors.length, allocatedTutors.length]);

  // Move actual DOM focus to match `focus` state after every render
  useEffect(() => {
    const key = `${focus.pool}-${focus.index}`;
    cardRefs.current[key]?.focus();
  }, [focus, availableTutors.length, allocatedTutors.length]);

  async function moveTutor(tutor, fromPool) {
    const { applicantId } = tutor;
    const toPool = fromPool === "available" ? "allocated" : "available";

    // Optimistic move between the two pools
    if (toPool === "allocated") {
      setAvailableTutors((prev) => prev.filter((t) => t.applicantId !== applicantId));
      setAllocatedTutors((prev) => [...prev, { ...tutor, courseId: selectedCourse, id: `temp-${applicantId}` }]);
    } else {
      setAllocatedTutors((prev) => prev.filter((t) => t.applicantId !== applicantId));
      setAvailableTutors((prev) => [...prev, tutor]);
    }

    // Puts the tutor back in their original pool when the server refuses
    const rollback = () => {
      if (toPool === "allocated") {
        setAllocatedTutors((prev) => prev.filter((t) => t.applicantId !== applicantId));
        setAvailableTutors((prev) => [...prev.filter((t) => t.applicantId !== applicantId), tutor]);
      } else {
        setAvailableTutors((prev) => prev.filter((t) => t.applicantId !== applicantId));
        setAllocatedTutors((prev) => [...prev.filter((t) => t.applicantId !== applicantId), tutor]);
      }
    };

    setMutatingId(applicantId);
    try {
      if (toPool === "allocated") {
        const res = await api.post("/allocation/assignments", { applicantId });
        if (res.status !== 201) {
          rollback();
          // The axios instance resolves every HTTP status, so refusals such
          // as the 409 requiredTutors cap arrive here rather than in catch.
          const message = res?.data?.message;
          if (res.status === 409 && message) {
            setNotice({ title: "Maximum required tutors reached", message, footnote: "The board was not changed." });
          } else if (message) {
            setNotice({ title: "Could not assign tutor", message, footnote: "The tutor remains in the available tutors list for this course." });
          }
          return;
        }
      } else {
        const res = await api.delete(`/allocation/assignments/${applicantId}`);
        if (res.status !== 204) {
          rollback();
          const message = res?.data?.message;
          if (message) setNotice({ title: "Action failed", message });
          return;
        }
      }
      await Promise.all([refetchPools(selectedCourse), refetchCourses()]);
    } catch (err) {
      rollback();
      // Network-level failures only (HTTP errors resolve; see above).
      const message = err?.response?.data?.message;
      setNotice({ title: "Action failed", message: message || "Network error. Please try again." });
    } finally {
      setMutatingId(null);
    }
  }

  async function removeAssignedTutor(tutor) {
    const { applicantId } = tutor;

    // Optimistic removal
    setAllocatedTutors((prev) => prev.filter((t) => t.applicantId !== applicantId));
    setMutatingId(applicantId);

    try {
      const res = await api.delete(`/allocation/assignments/${applicantId}/remove`);
      if (res.status !== 204) {
        // Rollback on failure (HTTP errors resolve rather than throw)
        setAllocatedTutors((prev) => [...prev, tutor]);
        const message = res?.data?.message;
        if (message) setNotice({ title: "Action failed", message });
      } else {
        await Promise.all([refetchPools(selectedCourse), refetchCourses()]);
      }
    } catch (err) {
      setAllocatedTutors((prev) => [...prev, tutor]);
      const message = err?.response?.data?.message;
      setNotice({ title: "Action failed", message: message || "Network error. Please try again." });
    } finally {
      setMutatingId(null);
    }
  }

  // One-click fill: the server assigns the top-ranked available applicants
  // until the course's requiredTutors cap is reached and reports anyone it
  // had to skip (and why) so the organiser can follow up manually.
  async function handleAutoAssign() {
    if (!course) return;

    setAutoAssigning(true);
    try {
      const res = await api.post("/allocation/auto-assign", { courseId: selectedCourse });
      if (res.status !== 200) {
        // The axios instance resolves every HTTP status, so refusals (e.g. the
        // 409 requiredTutors cap) arrive here rather than in catch.
        setNotice({
          title: "Auto-Assign failed",
          message: res?.data?.message || "The server could not complete auto-assignment.",
        });
        return;
      }

      const assigned = res.data?.assigned ?? [];
      const skipped = res.data?.skipped ?? [];

      await Promise.all([refetchPools(selectedCourse), refetchCourses()]);

      const names = assigned.map((tutor) => tutor.name).join(", ");
      setNotice({
        title: assigned.length > 0 ? "Auto-Assign complete" : "No tutors were allocated",
        message:
          assigned.length > 0
            ? `Allocated ${assigned.length} tutor${assigned.length === 1 ? "" : "s"} to ${course.code}: ${names}.${
                skipped.length > 0 ? ` ${skipped.length} applicant${skipped.length === 1 ? "" : "s"} skipped.` : ""
              }`
            : skipped.length > 0
              ? "Every available applicant failed a check — see the reasons below."
              : "There are no available applicants for this course right now.",
        details: skipped.map((s) => `${s.name} — ${s.reason}`),
        icon: assigned.length > 0 ? "check_circle" : "error",
        iconClass: assigned.length > 0 ? "text-trust-blue" : "text-urgent-orange",
        footnote:
          skipped.length > 0
            ? `Skipped tutors stay in the available pool for ${course.code}.`
            : null,
      });
    } catch (err) {
      const message = err?.response?.data?.message;
      setNotice({ title: "Auto-Assign failed", message: message || "Network error. Please try again." });
    } finally {
      setAutoAssigning(false);
    }
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
        if (tutor) moveTutor(tutor, pool);
        break;
      }
      case "Delete": {
        e.preventDefault();
        const tutor = list[index];
        if (tutor && pool === "allocated") removeAssignedTutor(tutor);
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
    // Tell the other organisers who is dragging what so they can watch
    // instead of dropping on the same card at the same time.
    const tutor =
      availableTutors.find((t) => t.id === tutorId) ||
      allocatedTutors.find((t) => t.id === tutorId);
    if (tutor && selectedCourse != null) {
      draggingRef.current = { applicantId: tutor.applicantId, applicantName: tutor.name };
      lastDragPoolRef.current = null;
      getOrganiserSocket()?.emit("board:drag", {
        applicantId: tutor.applicantId,
        applicantName: tutor.name,
        courseId: selectedCourse,
        pool: availableTutors.some((t) => t.id === tutorId) ? "available" : "allocated",
      });
    }
  }
  function handleDragEnd() {
    setDragOverPool(null);
    draggingRef.current = null;
    lastDragPoolRef.current = null;
    getOrganiserSocket()?.emit("board:drag-end");
  }
  function handleDragOver(e, poolId) {
    e.preventDefault();
    setDragOverPool(poolId);
    // Stream the drag position: whenever the card hovers a different pool,
    // other organisers see where it is heading in real time.
    if (
      draggingRef.current &&
      lastDragPoolRef.current !== poolId &&
      selectedCourse != null
    ) {
      lastDragPoolRef.current = poolId;
      getOrganiserSocket()?.emit("board:drag", {
        applicantId: draggingRef.current.applicantId,
        applicantName: draggingRef.current.applicantName,
        courseId: selectedCourse,
        pool: poolId,
      });
    }
  }
  function handleDrop(e, poolId) {
    e.preventDefault();
    setDragOverPool(null);
    draggingRef.current = null;
    lastDragPoolRef.current = null;
    getOrganiserSocket()?.emit("board:drag-end");
    const tutorId = e.dataTransfer.getData("text/plain");
    const draggedTutor =
      availableTutors.find((t) => t.id === tutorId) ||
      allocatedTutors.find((t) => t.id === tutorId);
    if (!draggedTutor) return;
    const fromPool = availableTutors.some((t) => t.id === tutorId) ? "available" : "allocated";
    if (fromPool !== poolId) moveTutor(draggedTutor, fromPool);
  }

  return (
    <AppLayout title="Tutor Management System">
      <div className="p-stack-md md:p-margin-page flex flex-col md:flex-row gap-gutter md:h-full">
        {/* Course list — full width with its own scroll on phones so the
            board below stays reachable; docked column from md up. */}
        <div className="w-full md:w-80 max-h-[45vh] md:max-h-none flex flex-col bg-surface-container-lowest border border-surface-variant rounded-xl shadow-sm overflow-hidden shrink-0">
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
                  onClick={() => setSelectedCourse(c.id)}
                  className={`w-full text-left p-stack-md rounded-lg border cursor-pointer transition-colors ${border}`}
                >
                  <div className="flex justify-between items-start mb-stack-sm">
                    <h3 className={`font-body-lg text-body-lg font-bold ${isActive ? "text-primary" : "text-on-surface"}`}>{c.code}</h3>
                    <span
                      className={`px-2 py-1 rounded font-data-mono text-data-mono text-xs ${
                        isLow ? "bg-urgent-orange text-on-urgent-orange" : isActive ? "bg-trust-blue text-on-trust-blue" : "bg-surface-variant text-on-surface-variant"
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
                      <div className={`h-1.5 rounded-full ${isLow ? "bg-urgent-orange" : "bg-primary"}`} style={{ width: `${Math.min(pct, 100)}%` }} />
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
                Drag tutors, or use ↑↓ to move, ←→ to switch pools, Enter to assign, Delete to remove, Esc to clear focus
              </p>
              {liveUpdate && (
                <p className="font-label-caps text-label-caps text-trust-blue mt-unit flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">sync</span>
                  Board updated by {liveUpdate.name} — pools refreshed
                </p>
              )}
              {remoteDrag && remoteDrag.courseId !== selectedCourse && (
                <p className="font-label-caps text-label-caps text-urgent-orange mt-unit flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">drag_pan</span>
                  {remoteDrag.name} is dragging {remoteDrag.applicantName} on another course
                </p>
              )}
            </div>
            <div className="flex items-center gap-stack-sm">
              {onlineOrganisers.length > 0 && (
                <span
                  className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1"
                  title={onlineOrganisers.map((o) => o.name).join(", ")}
                >
                  <span className="material-symbols-outlined text-[16px] text-trust-blue">group</span>
                  {onlineOrganisers.length} online
                </span>
              )}
              <button
                onClick={handleAutoAssign}
                disabled={autoAssigning || !course || allocatedTutors.length >= (course?.req ?? 0)}
                className="bg-surface-container-high text-on-surface px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:bg-surface-variant transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {autoAssigning ? "Assigning…" : "Auto-Assign"}
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
                <button
                  type="button"
                  onClick={() => setReloadKey((key) => key + 1)}
                  className="mt-stack-md inline-flex items-center gap-2 bg-primary text-on-primary px-stack-md py-stack-sm rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-lg">refresh</span>
                  Try again
                </button>
              </div>
            </div>
          ) : !course ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="font-body-sm text-on-surface-variant">No courses found. Seed or create a course to get started.</p>
            </div>
          ) : (
            <div className="flex-1 p-stack-md overflow-hidden flex flex-col md:flex-row gap-stack-lg">
              <Pool
                id="available"
                label={`Available for ${course.code}`}
                count={availableTutors.length}
                tutors={availableTutors}
                cardRefs={cardRefs}
                focus={focus}
                onCardKeyDown={handleCardKeyDown}
                onCardFocus={handleCardFocus}
                onDragStart={handleDragStartMouse}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                highlighted={dragOverPool}
                mutatingId={mutatingId}
                remoteDrag={remoteDrag}
              />
              <Pool
                id="allocated"
                label={`Assigned to ${course.code}`}
                count={`${allocatedTutors.length}/${course?.req ?? 0}`}
                tutors={allocatedTutors}
                cardRefs={cardRefs}
                focus={focus}
                onCardKeyDown={handleCardKeyDown}
                onCardFocus={handleCardFocus}
                onDragStart={handleDragStartMouse}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                highlighted={dragOverPool}
                onRemove={removeAssignedTutor}
                mutatingId={mutatingId}
                remoteDrag={remoteDrag}
              />
            </div>
          )}
        </div>
      </div>

      {/* Result dialog: server refusals (e.g. requiredTutors cap reached — the
          affected tutor stays in the available pool, the rollback already
          restored them) and Auto-Assign run summaries. */}
      {notice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="organiser-notice-title"
          onClick={() => setNotice(null)}
        >
          <div
            className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-lg p-stack-lg max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-stack-md mb-stack-md">
              <span className={`material-symbols-outlined ${notice.iconClass ?? "text-urgent-orange"} text-3xl shrink-0`}>
                {notice.icon ?? "error"}
              </span>
              <div>
                <h3 id="organiser-notice-title" className="font-headline-md text-headline-md text-on-surface mb-unit">
                  {notice.title}
                </h3>
                <p className="font-body-md text-on-surface-variant">{notice.message}</p>
              </div>
            </div>
            {notice.details?.length > 0 && (
              <ul className="mb-stack-md space-y-1">
                {notice.details.map((line, index) => (
                  <li key={index} className="font-body-sm text-on-surface-variant">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {notice.footnote && (
              <p className="font-body-sm text-outline mb-stack-md">{notice.footnote}</p>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setNotice(null)}
                className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-caps text-label-caps hover:opacity-90 transition-opacity"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
