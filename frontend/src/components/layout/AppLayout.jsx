import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopNavBar from "./TopNavBar";

/**
 * Tracks a CSS media query so the layout can respond to viewport changes live
 * (md+ ↔ tablet/mobile). matchMedia is guarded the same way ThemeProvider
 * guards it, so environments without the API fall back to the small-screen
 * layout instead of crashing.
 */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const queryList = window.matchMedia(query);
    // No re-sync needed here: the lazy useState initializer already captured
    // the current match at mount, and this listener keeps it live after that.
    const handleChange = (event) => setMatches(event.matches);
    queryList.addEventListener("change", handleChange);
    return () => queryList.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}

/**
 * AppLayout
 * Every authenticated page (Allocation Board, Tutor Dashboard, Volunteer View, Profile...)
 * renders <AppLayout> around its own content. The sidebar reads the user's role from
 * the auth context itself, so it only shows navigation relevant to that role.
 */
export default function AppLayout({ title, showSearch = true, avatarUrl, children }) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  // On md+ the sidebar is always docked; `expanded` toggles the full menu
  // (icons + labels) against the icon-only rail. Below that it opens as an
  // overlay drawer from the hamburger.
  const [expanded, setExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const menuOpen = isDesktop ? expanded : mobileOpen;
  const menuLabel = isDesktop
    ? expanded
      ? "Collapse menu"
      : "Expand menu"
    : mobileOpen
      ? "Close menu"
      : "Open menu";

  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex">
      <Sidebar
        desktop={isDesktop}
        expanded={isDesktop ? expanded : true}
        open={isDesktop ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div
        className={`flex-1 flex flex-col h-screen overflow-hidden transition-[margin] duration-300 motion-reduce:transition-none ${
          isDesktop ? (expanded ? "ml-sidebar-ml" : "ml-sidebar-ml-rail") : "ml-0"
        }`}
      >
        <TopNavBar
          title={title}
          showSearch={showSearch}
          avatarUrl={avatarUrl}
          menuOpen={menuOpen}
          menuLabel={menuLabel}
          onToggleSidebar={() =>
            isDesktop ? setExpanded((value) => !value) : setMobileOpen((value) => !value)
          }
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
