import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchAll } from "../../utils/searchIndex";
import api from "../../utils/axiosInstance";
import useAuth from "../../hooks/useAuth.js";

const TYPE_LABELS = { course: "Courses", analytics: "Analytics", person: "People", timesheet: "Timesheets" };
const TYPE_ICONS = { course: "menu_book", analytics: "analytics", person: "person", timesheet: "history_edu" };

// Both endpoints return objects carrying id/courseCode/courseName, so the
// same mapping covers course registry rows and application opportunities.
function mapApiCourse(c) {
  return { id: c.id, code: c.courseCode, name: c.courseName };
}

/**
 * GlobalSearch
 * One bar, three entity types. Lives in TopNavBar so it's available on every
 * authenticated page. Arrow keys move through results, Enter navigates, Escape closes.
 * What it recommends is role-scoped: students and tutors search the
 * opportunities open to them, staff search the course registry.
 */
export default function GlobalSearch() {
  const { role, loading: authLoading } = useAuth();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [courses, setCourses] = useState([]);
  // Small screens replace the inline field with an icon that opens a
  // full-width overlay panel under the top bar — the navbar row itself is
  // too crowded for a second input below lg.
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const normalizedRole = role?.toLowerCase() ?? null;

  // Fetch the course data this role is allowed to see once the profile is
  // loaded. Students and tutors never receive the course registry — they
  // search the application opportunities open to their availability instead.
  useEffect(() => {
    if (authLoading || !normalizedRole) return;

    let cancelled = false;
    const isApplicant = normalizedRole === "student" || normalizedRole === "tutor";
    const request = isApplicant ? api.get("/applications") : api.get("/courses");
    request
      .then((res) => {
        if (!cancelled && res.status === 200 && Array.isArray(res.data)) {
          setCourses(res.data.map(mapApiCourse));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authLoading, normalizedRole]);

  const results = searchAll(query, courses, normalizedRole);
  const grouped = results.reduce((acc, r) => {
    (acc[r.type] ||= []).push(r);
    return acc;
  }, {});

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goTo(entry) {
    setOpen(false);
    setQuery("");
    setMobileOpen(false);
    navigate(entry.to);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0) goTo(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setMobileOpen(false);
    }
  }

  // Shared result list — the wrapper classes differ between the desktop
  // dropdown (absolutely positioned under the inline field) and the mobile
  // overlay (stacked under the overlay input).
  function renderResults(wrapperClasses) {
    if (!open || !query) return null;
    return (
      <div
        className={`${wrapperClasses} max-h-96 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg z-50 custom-scrollbar`}
      >
        {results.length === 0 ? (
          <p className="p-stack-md font-body-sm text-body-sm text-on-surface-variant">
            No results for "{query}"
          </p>
        ) : (
          Object.entries(grouped).map(([type, entries]) => (
            <div key={type} className="py-stack-sm">
              <p className="px-stack-md font-label-caps text-label-caps text-on-surface-variant uppercase mb-1">
                {TYPE_LABELS[type]}
              </p>
              {entries.map((entry) => {
                const globalIndex = results.indexOf(entry);
                const isActive = globalIndex === activeIndex;
                return (
                  <button
                    key={`${entry.type}-${entry.id}`}
                    onClick={() => goTo(entry)}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    className={`w-full text-left flex items-center gap-stack-sm px-stack-md py-stack-sm transition-colors ${
                      isActive ? "bg-primary-fixed" : "hover:bg-surface-variant"
                    }`}
                  >
                    <span className="material-symbols-outlined text-primary text-[18px]">{TYPE_ICONS[type]}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-body-sm font-semibold text-on-surface truncate">{entry.title}</span>
                      <span className="block font-label-caps text-label-caps text-on-surface-variant truncate">
                        {entry.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    );
  }

  const closeMobile = () => {
    setMobileOpen(false);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Small screens: icon button that opens the overlay field */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        title="Search"
        aria-label="Open search"
        className="lg:hidden text-on-surface-variant hover:text-secondary hover:opacity-80 transition-colors p-unit rounded-full"
      >
        <span className="material-symbols-outlined">search</span>
      </button>

      {/* lg and up: inline field (as before) */}
      <div className="relative hidden lg:block">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search courses, people, timesheets..."
          className="pl-10 pr-4 py-2 bg-surface-container-high rounded-full border-none focus:ring-2 focus:ring-primary font-body-sm text-body-sm w-72"
        />
        {renderResults("absolute top-full mt-2 left-0 w-96")}
      </div>

      {/* Small screens: overlay field fixed under the sticky top bar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-x-4 top-16 z-50">
          <div className="relative shadow-lg">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search courses, people, timesheets..."
              aria-label="Search courses, people, timesheets"
              className="w-full pl-10 pr-12 py-2 bg-surface-container-lowest border border-outline-variant rounded-full focus:ring-2 focus:ring-primary font-body-sm text-body-sm"
            />
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors p-unit"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          {renderResults("mt-2")}
        </div>
      )}
    </div>
  );
}