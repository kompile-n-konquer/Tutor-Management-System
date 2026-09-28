import { NavLink, useNavigate } from "react-router-dom";
import { getNavLinksForRole, getFooterLinksForRole } from "../../config/navConfig";
import useAuth from "../../hooks/useAuth";

export default function Sidebar() {
  const { signOut, role } = useAuth();
  const navigate = useNavigate();

  const links = getNavLinksForRole(role);
  const footerLinks = getFooterLinksForRole(role);

  const handleNavigate = async (label, url) => {
    if (label === "Logout") {
      await signOut();
    }
    navigate(url);
  };

  return (
    <nav className="hidden md:flex flex-col h-full py-margin-page bg-surface-container-low border-r border-outline-variant fixed left-0 top-0 w-sidebar-width z-50">
      <div className="px-gutter mb-stack-lg flex items-center gap-stack-sm">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
            school
          </span>
        </div>
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold text-primary truncate leading-tight">
            Tutor Flow
          </h1>
          <p className="font-label-caps text-label-caps text-on-surface-variant truncate">
            School of Computer Science
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-stack-md custom-scrollbar space-y-unit">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              [
                "flex items-center gap-stack-md px-gutter py-stack-sm rounded-lg transition-colors group",
                isActive
                  ? "bg-primary-container text-on-primary font-semibold scale-[0.98] transition-transform duration-150"
                  : "text-on-surface-variant hover:bg-surface-variant font-medium",
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className="material-symbols-outlined shrink-0"
                  style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {link.icon}
                </span>
                <span className="font-body-md truncate">{link.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="mt-auto px-stack-md space-y-stack-sm">
        {(role === "organiser" || role === "lecturer") && (
          <button className="w-full flex items-center justify-center gap-stack-sm bg-urgent-orange text-on-urgent-orange rounded-lg px-gutter py-stack-sm font-label-caps text-label-caps hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined">warning</span>
            Resolve Conflicts
          </button>
        )}

        <div className="pt-stack-md border-t border-outline-variant space-y-unit">
          {footerLinks.map((link) => {
            return <div
              key={link.to}
              onClick={() => handleNavigate(link.label, link.to)}
              className="flex items-center gap-stack-md text-on-surface-variant px-gutter py-stack-sm hover:bg-surface-variant transition-colors rounded-lg group cursor-pointer"
            >
              <span className="material-symbols-outlined shrink-0">{link.icon}</span>
              <span className="font-body-md font-medium truncate">{link.label}</span>
            </div>
          })}
        </div>
      </div>
    </nav>
  );
}
