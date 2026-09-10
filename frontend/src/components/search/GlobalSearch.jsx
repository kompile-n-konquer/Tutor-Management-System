import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { searchAll } from "../../utils/searchIndex";

const TYPE_LABELS = { course: "Courses", analytics: "Analytics", person: "People", timesheet: "Timesheets" };
const TYPE_ICONS = { course: "menu_book", analytics: "analytics", person: "person", timesheet: "history_edu" };

/**
 * GlobalSearch
 * One bar, three entity types. Lives in TopNavBar so it's available on every
 * authenticated page. Arrow keys move through results, Enter navigates, Escape closes.
 */
export default function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const results = searchAll(query);
  const grouped = results.reduce((acc, r) => {
    (acc[r.type] ||= []).push(r);
    return acc;
  }, {});

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function goTo(entry) {
    setOpen(false);
    setQuery("");
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
    }
  }

  return (
    <div ref={containerRef} className="relative hidden lg:block">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
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

      {open && query && (
        <div className="absolute top-full mt-2 left-0 w-96 max-h-96 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg z-50 custom-scrollbar">
          {results.length === 0 ? (
            <p className="p-stack-md font-body-sm text-body-sm text-on-surface-variant">No results for "{query}"</p>
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
      )}
    </div>
  );
}