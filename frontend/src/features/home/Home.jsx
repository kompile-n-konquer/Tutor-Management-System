import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="bg-background text-on-background font-body-md min-h-screen flex flex-col">
      <header className="w-full top-0 sticky bg-surface shadow-sm z-50">
        <div className="flex justify-between items-center w-full px-margin-page py-stack-md max-w-container-max mx-auto">
          <Link to="/" className="text-headline-md font-headline-lg font-bold text-primary hover:text-secondary transition-colors">
            Tutor Flow
          </Link>
          <nav className="hidden md:flex gap-8">
            <a className="text-on-surface-variant font-body-md text-body-md hover:text-secondary transition-colors" href="#benefits">Benefits</a>
            <a className="text-on-surface-variant font-body-md text-body-md hover:text-secondary transition-colors" href="#features">Features</a>
            <a className="text-on-surface-variant font-body-md text-body-md hover:text-secondary transition-colors" href="#contact">Contact</a>
          </nav>
          <Link
            to="/signup"
            className="bg-primary-container text-on-primary-container font-label-caps text-label-caps px-4 py-2 rounded-lg hover:bg-secondary-container hover:text-on-secondary-container transition-colors shadow-sm"
          >
            Sign Up
          </Link>
        </div>
      </header>

      <main className="flex-grow">
        <section className="relative bg-surface-container-lowest overflow-hidden pt-32 pb-40">
          <div className="max-w-container-max mx-auto px-margin-page relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-gutter items-center">
            <div className="max-w-2xl">
              <h1 className="font-display text-display text-primary mb-6 leading-tight">
                Empowering Academic Excellence at CSAM
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant mb-10">
                A centralized platform for Computer Science and Applied Mathematics tutor management, allocation, and
                volunteer opportunities. Streamline your academic journey with intelligent tools.
              </p>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 bg-primary-container text-on-primary-container font-headline-md text-headline-md px-8 py-4 rounded-xl hover:shadow-lg hover:bg-primary transition-all duration-300 active:scale-95 shadow-[0px_4px_20px_rgba(75,0,130,0.15)] group"
              >
                Enter Portal
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
              </Link>
            </div>
            <div className="relative h-[400px] w-full rounded-2xl overflow-hidden shadow-[0px_12px_32px_rgba(75,0,130,0.08)] bg-surface border border-surface-variant">
              <div className="absolute inset-0 bg-gradient-to-br from-primary-fixed via-tertiary-fixed to-secondary-fixed opacity-40" />
            </div>
          </div>
        </section>

        <section className="py-32 bg-surface-container-low" id="features">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Engineered for Efficiency</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Tailored tools for every role within the CSAM ecosystem, designed to eliminate friction and elevate the
                academic experience.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-stack-lg">
              {[
                { icon: "hub", eyebrow: "For Organisers", title: "Seamless Allocation", body: "Real-time conflict resolution and smart tutor matching. Ensure complete coverage without the administrative headache.", bg: "bg-primary-fixed", fg: "text-primary-container" },
                { icon: "calendar_clock", eyebrow: "For Tutors", title: "Your Schedule, Simplified", body: "Manage timesheets, track hours, and stay on top of your sessions with intuitive calendar integrations.", bg: "bg-secondary-fixed", fg: "text-secondary-container" },
                { icon: "school", eyebrow: "For Students", title: "Volunteer & Grow", body: "Find overflow opportunities, build your academic portfolio, and engage deeper with course material.", bg: "bg-tertiary-fixed", fg: "text-tertiary-container" },
              ].map((card) => (
                <div key={card.title} className="bg-surface-container-lowest p-8 rounded-xl border border-surface-variant shadow-bento hover:shadow-[0px_12px_32px_rgba(75,0,130,0.08)] transition-all duration-300 group flex flex-col h-full">
                  <div className={`w-14 h-14 ${card.bg} rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <span className={`material-symbols-outlined ${card.fg} text-3xl`}>{card.icon}</span>
                  </div>
                  <div className="font-label-caps text-label-caps text-on-surface-variant mb-2">{card.eyebrow}</div>
                  <h3 className="font-headline-md text-headline-md text-on-surface mb-4">{card.title}</h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant flex-grow">{card.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-32 bg-surface" id="benefits">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="bg-primary text-on-primary rounded-2xl p-12 md:p-16 relative overflow-hidden shadow-lg flex flex-col md:flex-row items-center gap-12">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary-container rounded-full blur-3xl opacity-50 pointer-events-none" />
              <div className="flex-1 relative z-10">
                <h2 className="font-headline-lg text-headline-lg mb-6">Commitment to Excellence</h2>
                <p className="font-body-lg text-body-lg text-primary-fixed mb-8 max-w-2xl">
                  The School of Computer Science and Applied Mathematics is dedicated to fostering student-led teaching
                  initiatives and efficient resource management.
                </p>
                <a
                  className="inline-flex items-center gap-2 border-2 border-inverse-primary text-inverse-primary font-headline-md text-headline-md px-6 py-3 rounded-xl hover:bg-inverse-primary hover:text-primary transition-colors duration-300"
                  href="#"
                >
                  Learn more about CSAM
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-stack-lg bg-surface-container-highest border-t border-outline-variant mt-auto" id="contact">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-margin-page max-w-container-max mx-auto gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="font-headline-md text-headline-md font-bold text-on-surface">Tutor Flow</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              © 2024 School of Computer Science and Applied Mathematics. All rights reserved.
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-6">
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-secondary transition-colors" href="#">Privacy Policy</a>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-secondary transition-colors" href="#">Terms of Service</a>
            <a className="font-body-sm text-body-sm text-on-surface-variant hover:text-secondary transition-colors" href="#">Help Center</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}