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
        {/* HERO */}
        <section className="relative bg-surface-container-lowest overflow-hidden pt-32 pb-20">
          <div className="max-w-container-max mx-auto px-margin-page relative z-10">
            <div className="max-w-2xl">
              <h1 className="font-display text-display text-primary mb-6 leading-tight">
                Tutoring made easier.
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
          </div>
        </section>

        {/* BENEFITS — why organisers and tutors should use the app */}
        <section className="py-20 bg-surface-container-low" id="benefits">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Why Use Tutor Flow</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Built to take the administrative weight off organisers and tutors, so more time goes into teaching.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-lg">
              {[
                {
                  icon: "hub",
                  eyebrow: "For Organisers",
                  title: "One board, every allocation",
                  body: "Assign tutors to courses based on their marks, availability, and weekly hour limits — all from a single allocation board, instead of spreadsheets and back-and-forth emails.",
                  bg: "bg-primary-fixed",
                  fg: "text-primary-container",
                },
                {
                  icon: "calendar_clock",
                  eyebrow: "For Tutors",
                  title: "Your hours, handled properly",
                  body: "Log your hours, submit timesheets, and excuse yourself from sessions you can't make — all tracked in one place, with nothing lost in email threads.",
                  bg: "bg-secondary-fixed",
                  fg: "text-secondary-container",
                },
              ].map((card) => (
                <div key={card.title} className="bg-surface-container-lowest p-8 rounded-xl border border-surface-variant shadow-[0px_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0px_12px_32px_rgba(75,0,130,0.08)] transition-all duration-300 group flex flex-col h-full">
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

        {/* FEATURES — brief overview of what's implemented */}
        <section className="py-20 bg-surface" id="features">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Features</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                A quick look at what's built into the platform today.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-md">
              {[
                { icon: "hub", title: "Allocation Board", body: "Organisers assign tutors to courses based on their marks, availability, and weekly hour limits." },
                { icon: "calendar_clock", title: "Timesheets", body: "Tutors log their hours and submit timesheets for organisers to approve." },
                { icon: "event_busy", title: "Session Excusals", body: "Tutors can excuse themselves from sessions they're unable to make." },
                { icon: "school", title: "Tutor Applications", body: "Students apply to become tutors through the platform." },
                { icon: "volunteer_activism", title: "Overflow Work", body: "Students can volunteer for overflow tutoring work beyond their allocated sessions." },
                { icon: "group", title: "Role-Based Access", body: "Tailored views for organisers, tutors, and students across the school." },
              ].map((feature) => (
                <div key={feature.title} className="p-6 rounded-xl border border-surface-variant bg-surface-container-lowest flex gap-4 items-start">
                  <span className="material-symbols-outlined text-primary text-2xl mt-1">{feature.icon}</span>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface mb-1">{feature.title}</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{feature.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* COMMITMENT TO EXCELLENCE */}
        <section className="py-20 bg-surface-container-low">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="bg-primary text-on-primary rounded-2xl p-12 md:p-16 relative overflow-hidden shadow-lg flex flex-col md:flex-row items-center gap-12">
              <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary-container rounded-full blur-3xl opacity-50 pointer-events-none" />
              <div className="flex-1 relative z-10">
                <h2 className="font-headline-lg text-headline-lg mb-6">Commitment to Excellence</h2>
                <p className="font-body-lg text-body-lg text-primary-fixed mb-8 max-w-2xl">
                  The School offers academic programmes which are at the forefront of national interests and a
                  transforming world. Our unique programmes include Big Data Analytics, Data Science, Robotics,
                  eScience and eResearch. Our Applied Mathematics courses include Computational Methods,
                  Mathematical Modelling and Analytical Methods which provide skill-sets in solving abstract problems.
                </p>
                <a
                  className="inline-flex items-center gap-2 border-2 border-inverse-primary text-inverse-primary font-headline-md text-headline-md px-6 py-3 rounded-xl hover:bg-inverse-primary hover:text-primary transition-colors duration-300"
                  href="https://www.wits.ac.za/csam/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Learn more about CSAM
                  <span className="material-symbols-outlined">open_in_new</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT — who built the app */}
        <section className="py-20 bg-surface" id="contact">
          <div className="max-w-container-max mx-auto px-margin-page">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="font-headline-lg text-headline-lg text-primary mb-4">Contact</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Run into an issue, or want to know who built this? Reach out to the team below.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-stack-md max-w-4xl mx-auto">
              {[
                "Mogomotsi Motoma",
                "Nduvho Mulaudzi",
                "Kgaogelo Mohlala",
                "Ndumiso Skhosana",
                "Nhlamulo Mabuza",
                "Tlhalefo Sebaeng",
              ].map((name) => (
                <div key={name} className="p-6 rounded-xl border border-surface-variant bg-surface-container-lowest text-center">
                  <span className="material-symbols-outlined text-primary text-2xl mb-2">person</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">{name}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full py-stack-lg bg-surface-container-highest border-t border-outline-variant mt-auto">
        <div className="flex flex-col items-center w-full px-margin-page max-w-container-max mx-auto gap-2">
          <span className="font-headline-md text-headline-md font-bold text-on-surface">Tutor Flow</span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            COMS3011A — Software Design Project
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            Kompile and Konquer
          </span>
        </div>
      </footer>
    </div>
  );
}