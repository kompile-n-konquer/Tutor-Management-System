import { getNavLinksForRole, FOOTER_LINKS } from "../../../config/navConfig";
import TutorDashboardContent from "../../tutor-dashboard/TutorDashboardContent";

/**
 * DashboardPreview — the hero's live showcase of the actual TutorFlow app.
 * The body is the real TutorDashboardContent component (not a mock), the
 * mini sidebar is a static replica styled like the real Sidebar and driven by
 * the same navConfig links for the tutor role. Nothing here navigates or
 * requires auth; the preview body scrolls so the whole dashboard is browseable.
 */
export default function DashboardPreview() {
  const links = getNavLinksForRole("tutor");

  return (
    <div className="mt-12 md:mt-16 relative max-w-5xl mx-auto">
      {/* Decorative outer glow */}
      <div className="absolute -inset-1.5 bg-gradient-to-r from-brand-600 via-brand-800 to-secondary-container rounded-[1.75rem] opacity-30 blur-2xl pointer-events-none" />

      {/* Browser window frame (OLED dark) */}
      <div className="relative bg-ink-900 rounded-3xl shadow-2xl border border-ink-700 overflow-hidden">
        {/* Window chrome bar */}
        <div className="bg-ink-950 px-4 py-3 border-b border-ink-700 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
            <span className="w-3 h-3 rounded-full bg-secondary-container shrink-0" />
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
            <span className="ml-2 font-label-caps text-xs text-white/40 truncate hidden sm:inline">
              tutorflow · tutor-dashboard
            </span>
          </div>
          <div className="flex items-center gap-2 font-label-caps text-[11px] text-white/40 shrink-0">
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 animate-ping opacity-60" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
            </span>
            <span>Live App Preview</span>
          </div>
        </div>

        {/* App body — real sidebar look + real dashboard content */}
        <div className="flex bg-background">
          {/* Static sidebar replica (real navConfig links, real Sidebar styling) */}
          <aside className="hidden lg:flex flex-col w-56 shrink-0 bg-surface-container-low border-r border-outline-variant py-4">
            <div className="px-4 mb-stack-lg flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-container-highest shrink-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  school
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="font-body-md text-[16px] font-bold text-primary truncate leading-tight">Tutor Flow</h1>
                <p className="font-label-caps text-[10px] text-on-surface-variant truncate">School of Computer Science</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-1">
              {links.map((link, index) => {
                // The preview shows the Tutor Dashboard, so highlight it like the real active NavLink.
                const isActive = index === 0;
                return (
                  <div
                    key={link.to}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                      isActive ? "bg-primary-container text-on-primary font-semibold" : "text-on-surface-variant font-medium"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px] shrink-0" style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                      {link.icon}
                    </span>
                    <span className="font-body-sm text-body-sm truncate">{link.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 pt-2 border-t border-outline-variant px-2 space-y-1">
              {FOOTER_LINKS.map((link) => (
                <div key={link.to} className="flex items-center gap-3 text-on-surface-variant px-3 py-2">
                  <span className="material-symbols-outlined text-[20px] shrink-0">{link.icon}</span>
                  <span className="font-body-sm text-body-sm font-medium truncate">{link.label}</span>
                </div>
              ))}
            </div>
          </aside>

          {/* The real dashboard, scrollable inside the frame */}
          <div className="flex-1 min-w-0 h-[440px] sm:h-[500px] md:h-[560px] overflow-y-auto custom-scrollbar">
            <TutorDashboardContent />
          </div>
        </div>
      </div>
    </div>
  );
}
