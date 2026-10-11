import { NavLink, useNavigate } from "react-router-dom";
import { getNavLinksForRole, FOOTER_LINKS } from "../../config/navConfig";
import useAuth from "../../hooks/useAuth";

// Reference grouping: role dashboards/boards on top, the working set below.
const SECTIONS = [
  { id: "main", title: "Main Menu" },
  { id: "general", title: "General" },
];

export default function Sidebar({ desktop = false, expanded = true, open = false, onClose }) {
  const { signOut, role, userProfile, currentUser } = useAuth();
  const navigate = useNavigate();

  const links = getNavLinksForRole(role);
  // On desktop the collapsed state is an icon-only rail; the mobile drawer is
  // always rendered fully expanded.
  const rail = desktop && !expanded;

  const handleNavigate = async (label, url) => {
    // Footer navigation closes the drawer first so the destination page is
    // never left hidden behind it on small screens. On desktop this is a
    // no-op — the docked sidebar stays put.
    onClose?.();
    if (label === "Logout") {
      await signOut();
    }
    navigate(url);
  };

  const displayName = userProfile
    ? `${userProfile.firstName ?? ""} ${userProfile.lastName ?? ""}`.trim()
    : currentUser?.email || "Guest";
  const initials = (
    userProfile
      ? `${userProfile.firstName?.[0] ?? ""}${userProfile.lastName?.[0] ?? ""}`
      : currentUser?.email?.[0] ?? ""
  ).toUpperCase();
  const roleTitle = role ? role.charAt(0).toUpperCase() + role.slice(1) : "Member";

  // Row contract shared by nav and account items. The active route swaps in
  // the contrasting white pill; hover tints only apply to inactive rows so
  // they never fight the pill.
  const itemClass = ({ isActive }) =>
    [
      "flex items-center h-11 rounded-xl transition-colors",
      rail ? "justify-center" : "gap-3.5 px-3",
      isActive
        ? "bg-sidebar-active text-on-sidebar-active"
        : "text-on-sidebar-muted hover:bg-sidebar-surface-hover hover:text-on-sidebar",
    ].join(" ");

  const sectionTitle = (title) =>
    !rail && (
      <p className="font-label-caps text-label-caps text-on-sidebar-muted px-3 pb-1">{title}</p>
    );

  const renderItemLabel = (label) =>
    !rail && <span className="font-body-sm font-medium truncate min-w-0">{label}</span>;

  const renderItemIcon = (icon, isActive) => (
    <span
      className="material-symbols-outlined text-[20px] shrink-0"
      style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {icon}
    </span>
  );

  return (
    <>
      {/* Below md the sidebar overlays the page — the scrim dims the content
          behind it and closes the drawer when clicked. */}
      {!desktop && open && (
        <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} aria-hidden="true" />
      )}
      <nav
        id="app-sidebar"
        aria-label="Main navigation"
        inert={!open}
        className={[
          "fixed z-50 flex flex-col bg-sidebar-surface",
          "transition-[width,transform] duration-300 motion-reduce:transition-none",
          desktop
            ? "left-3 top-3 bottom-3 rounded-2xl shadow-sidebar"
            : "left-0 top-0 bottom-0 rounded-r-2xl",
          desktop ? (expanded ? "w-sidebar-width" : "w-sidebar-rail") : "w-sidebar-width",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Brand */}
        <div className={`flex items-center h-16 shrink-0 ${rail ? "justify-center" : "gap-3 px-4"}`}>
          <div className="w-11 h-11 rounded-[9999px] bg-sidebar-logo shrink-0 flex items-center justify-center">
            <span className="text-on-sidebar-logo text-lg font-extrabold leading-none tracking-wide">TF</span>
          </div>
          {!rail && (
            <div className="min-w-0">
              <h1 className="text-[20px] leading-tight font-bold text-on-sidebar truncate">Tutor Flow</h1>
              {/* The close button leaves no room for the subtitle in the
                  mobile drawer, so it only renders on the desktop panel. */}
              {desktop && (
                <p className="font-label-caps text-[10px] text-on-sidebar-muted truncate">
                  School of Computer Science
                </p>
              )}
            </div>
          )}
          {/* The drawer covers the top bar, so it carries its own close control. */}
          {!desktop && (
            <button
              type="button"
              onClick={onClose}
              title="Close menu"
              aria-label="Close menu"
              className="ml-auto shrink-0 text-on-sidebar-muted hover:bg-sidebar-surface-hover hover:text-on-sidebar rounded-[9999px] p-1.5 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          )}
        </div>

        {/* Grouped navigation — selecting a destination closes the drawer on
            small screens; on desktop the docked panel simply stays expanded. */}
        <div className="flex-1 overflow-y-auto sidebar-scroll px-3 pt-2 pb-3 space-y-4">
          {SECTIONS.map(({ id, title }) => {
            const sectionLinks = links.filter((link) => link.section === id);
            if (sectionLinks.length === 0) return null;
            return (
              <div key={id} className="space-y-1">
                {sectionTitle(title)}
                {sectionLinks.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={onClose}
                    title={link.label}
                    className={itemClass}
                  >
                    {({ isActive }) => (
                      <>
                        {renderItemIcon(link.icon, isActive)}
                        {renderItemLabel(link.label)}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}

          {/* Account group */}
          <div className="space-y-1">
            {sectionTitle("Account")}
            {FOOTER_LINKS.map((link) =>
              link.label === "Logout" ? (
                <button
                  key={link.to}
                  type="button"
                  title="Logout"
                  onClick={() => handleNavigate(link.label, link.to)}
                  className={[
                    "flex items-center h-11 w-full rounded-xl transition-colors",
                    "text-on-sidebar-muted hover:bg-sidebar-surface-hover hover:text-on-sidebar",
                    rail ? "justify-center" : "gap-3.5 px-3",
                  ].join(" ")}
                >
                  <span className="material-symbols-outlined text-[20px] shrink-0">{link.icon}</span>
                  {renderItemLabel(link.label)}
                </button>
              ) : (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={onClose}
                  title={link.label}
                  className={itemClass}
                >
                  {({ isActive }) => (
                    <>
                      {renderItemIcon(link.icon, isActive)}
                      {renderItemLabel(link.label)}
                    </>
                  )}
                </NavLink>
              ),
            )}
          </div>
        </div>

        {/* Footer — the signed-in user card */}
        <div className="shrink-0 px-3 pb-3 space-y-stack-sm">
          <div
            className={`flex items-center rounded-xl bg-sidebar-surface-hover p-2 ${
              rail ? "justify-center" : "gap-3"
            }`}
          >
            <div className="w-9 h-9 rounded-[9999px] shrink-0 bg-sidebar-active flex items-center justify-center">
              <span className="text-on-sidebar-active text-sm font-bold leading-none">
                {initials || "U"}
              </span>
            </div>
            {!rail && (
              <div className="min-w-0">
                <p className="font-body-sm font-semibold text-on-sidebar truncate leading-snug">
                  {displayName || "Guest"}
                </p>
                <p className="text-[12px] leading-snug text-on-sidebar-muted truncate">{roleTitle}</p>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
