/**
 * Commitment — the dark "Commitment to Excellence" banner. Uses the real
 * CSAM school copy and links out to the actual CSAM site.
 */
export default function Commitment() {
  return (
    <section id="commitment" className="py-16 md:py-24 bg-surface-container-lowest scroll-mt-24">
      <div className="max-w-container-max mx-auto px-margin-page">
        <div className="bg-gradient-to-br from-brand-950 via-brand-900 to-[#180024] rounded-3xl p-8 sm:p-12 md:p-16 text-white shadow-2xl relative overflow-hidden border border-brand-900/50">
          {/* Decorative dot mesh + amber glow */}
          <div className="absolute inset-0 opacity-10 dot-mesh pointer-events-none" />
          <div className="absolute -right-20 -bottom-20 w-80 h-80 rounded-[9999px] bg-secondary-container/10 blur-3xl pointer-events-none" />
          <div className="absolute -left-24 -top-24 w-72 h-72 rounded-[9999px] bg-brand-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/10 backdrop-blur-md border border-white/20 text-xs font-label-caps text-amber-200 uppercase tracking-wider">
              <span>School of Computer Science &amp; Applied Mathematics</span>
            </div>

            <h2 className="font-display text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Commitment to Excellence
            </h2>

            <p className="text-white/75 text-sm sm:text-base md:text-lg leading-relaxed font-light">
              The School offers academic programmes which are at the forefront of national interests and a transforming
              world. Our unique programmes include Big Data Analytics, Data Science, Robotics, eScience and eResearch.
              Our Applied Mathematics courses include Computational Methods, Mathematical Modelling and Analytical
              Methods which provide skill-sets in solving abstract problems.
            </p>

            <div className="pt-4 flex flex-wrap items-center gap-4">
              <a
                className="bg-white hover:bg-amber-300 text-brand-950 font-label-caps font-bold text-xs uppercase tracking-wider py-3.5 px-6 rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center gap-2"
                href="https://www.wits.ac.za/csam/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>Learn more about CSAM</span>
                <span className="material-symbols-outlined text-amber-600 text-[18px]">open_in_new</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
