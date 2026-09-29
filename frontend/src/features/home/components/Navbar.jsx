import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const NAV_ITEMS = [
  { id: "benefits", label: "Benefits" },
  { id: "features", label: "Features" },
  { id: "commitment", label: "CSAM Excellence" },
  { id: "contact", label: "Contact" },
];

/**
 * Navbar — sticky landing navigation. Links scroll to landing sections
 * (with a scroll-spy highlight) while Log In / Enter Portal keep pointing at
 * the real /login and /signup routes.
 */
export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  // Highlight the nav link whose section is currently in view.
  useEffect(() => {
    const onScroll = () => {
      const probe = window.scrollY + 140;
      let current = "";
      for (const { id } of NAV_ITEMS) {
        const section = document.getElementById(id);
        if (section && section.offsetTop <= probe) current = id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full bg-surface/90 backdrop-blur-md border-b border-outline-variant/60 shadow-sm transition-shadow">
      <div className="max-w-container-max mx-auto px-margin-page h-20 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 group" aria-label="Tutor Flow home">
          <div className="w-10 h-10 rounded-xl bg-brand-900 text-secondary-container flex items-center justify-center shadow-glow-brand group-hover:bg-brand-800 transition-colors">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              school
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-body-md text-[20px] font-extrabold text-brand-900 tracking-tight leading-none">
              Tutor Flow
            </span>
            <span className="font-label-caps text-[10px] text-outline tracking-[0.22em] uppercase">
              CSAM Portal
            </span>
          </div>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Landing sections">
          {NAV_ITEMS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`text-sm font-medium py-1 transition-colors ${
                activeSection === id ? "text-brand-900 font-semibold" : "text-on-surface-variant hover:text-brand-900"
              }`}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Actions — link to the real auth routes */}
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden sm:inline-flex items-center font-label-caps text-label-caps text-on-surface-variant hover:text-brand-900 px-3 py-2 rounded-lg transition-colors"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="bg-brand-900 hover:bg-brand-800 text-white font-label-caps text-label-caps uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-glow-brand hover:shadow-glow-amber transition-all active:scale-[0.98] flex items-center gap-2 group"
          >
            <span>Enter Portal</span>
            <span className="material-symbols-outlined text-secondary-container text-[18px] group-hover:translate-x-0.5 transition-transform">
              arrow_forward
            </span>
          </Link>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-2 text-on-surface-variant hover:text-brand-900 rounded-lg border border-outline-variant"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="material-symbols-outlined">{menuOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden bg-surface border-b border-outline-variant/60 px-margin-page py-4 space-y-1">
          {NAV_ITEMS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setMenuOpen(false)}
              className="block text-sm font-medium text-on-surface-variant hover:text-brand-900 py-2 border-b border-surface-variant last:border-b-0 transition-colors"
            >
              {label}
            </a>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="w-full text-center py-2 font-label-caps text-label-caps uppercase text-on-surface-variant bg-surface-container-high rounded-lg"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMenuOpen(false)}
              className="w-full text-center py-2.5 font-label-caps text-label-caps uppercase text-white bg-brand-900 rounded-lg"
            >
              Enter Portal
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
