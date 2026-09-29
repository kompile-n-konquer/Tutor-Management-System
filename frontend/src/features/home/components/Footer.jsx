import { Link } from "react-router-dom";

const SECTION_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#features", label: "Features" },
  { href: "#commitment", label: "CSAM Excellence" },
  { href: "#contact", label: "Contact" },
];

/**
 * Footer — dark OLED footer that keeps the original project credits
 * (COMS3011A — Software Design Project, Kompile and Konquer).
 */
export default function Footer() {
  return (
    <footer className="bg-ink-950 text-white/50 text-xs py-12 border-t border-ink-700 mt-auto">
      <div className="max-w-container-max mx-auto px-margin-page space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-900 text-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                school
              </span>
            </div>
            <span className="text-base font-bold text-white tracking-tight">Tutor Flow</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 font-label-caps text-[11px] uppercase tracking-wider">
            {SECTION_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
            <Link to="/login" className="hover:text-white transition-colors">
              Portal Login
            </Link>
          </div>
        </div>

        <div className="pt-6 border-t border-ink-700 flex flex-col sm:flex-row items-center justify-between gap-4 font-label-caps text-[11px] uppercase tracking-wider">
          <p>&copy; 2026 School of Computer Science &amp; Applied Mathematics. All rights reserved.</p>
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center">
            {/* <span>COMS3011A — Software Design Project</span> */}
            <span className="hidden sm:inline text-ink-600">&bull;</span>
            <span className="text-white/70">TutorFlow</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
