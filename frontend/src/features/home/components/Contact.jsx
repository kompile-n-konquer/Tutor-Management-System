import { useState } from "react";
import Input from "../../../components/input/Input";

const TEAM_MEMBERS = [
  "Mogomotsi Motoma",
  "Nduvho Mulaudzi",
  "Kgaogelo Mohlala",
  "Ndumiso Skhosana",
  "Nhlamulo Mabuza",
  "Tlhalefo Sebaeng",
];

const HELPDESK_ROWS = [
  {
    icon: "mail",
    iconClasses: "bg-brand-100 text-brand-900",
    label: "Support Email",
    value: "csam.help@university.edu",
    href: "mailto:csam.help@university.edu",
  },
  {
    icon: "location_on",
    iconClasses: "bg-secondary-fixed text-on-secondary-fixed-variant",
    label: "Department Office",
    value: "Mathematical Sciences Building, 3rd Floor",
  },
  {
    icon: "schedule",
    iconClasses: "bg-emerald-100 text-emerald-800",
    label: "Hours of Operation",
    value: "Mon – Fri: 08:00 – 16:30",
  },
];

/**
 * Contact — CSAM helpdesk details, a contact form and the original team
 * credits from the Kompile and Konquer project team.
 */
export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", category: "tutor", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  function updateField(field) {
    return (event) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <section id="contact" className="py-20 bg-surface-container-low border-t border-outline-variant/50 scroll-mt-24">
      <div className="max-w-container-max mx-auto px-margin-page">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
          <span className="font-label-caps text-xs font-bold text-brand-800 uppercase tracking-widest bg-brand-100/70 px-3 py-1 rounded-md">
            Get in Touch
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight">
            Contact Support
          </h2>
          <p className="text-base sm:text-lg text-on-surface-variant">
            Run into an issue, or want to know who built this? Reach out to the team below.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Helpdesk card */}
          <div className="lg:col-span-5 bg-surface-container-lowest rounded-3xl p-8 border border-outline-variant/90 shadow-sm space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-on-surface">CSAM Helpdesk</h3>
              <p className="text-sm text-on-surface-variant">
                Our administrative staff and chief tutors respond to inquiries during university operating hours.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {HELPDESK_ROWS.map((row) => (
                <div key={row.label} className="flex items-start gap-4 p-3.5 bg-surface-container-low rounded-2xl border border-surface-variant">
                  <div className={`p-2.5 rounded-xl shrink-0 ${row.iconClasses}`}>
                    <span className="material-symbols-outlined text-[20px]">{row.icon}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-label-caps text-[11px] font-semibold text-outline uppercase tracking-wider">
                      {row.label}
                    </div>
                    {row.href ? (
                      <a href={row.href} className="text-sm font-semibold text-primary hover:underline font-label-caps">
                        {row.value}
                      </a>
                    ) : (
                      <div className="text-sm font-semibold text-on-surface">{row.value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-7 bg-surface-container-lowest rounded-3xl p-8 sm:p-10 border border-outline-variant/90 shadow-sm space-y-6">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-on-surface">Send a Message</h3>
              <p className="text-xs text-outline font-label-caps uppercase tracking-wider">
                We typically respond within 24 hours during term times.
              </p>
            </div>

            {sent ? (
              <div
                role="status"
                className="space-y-4 p-6 rounded-2xl bg-brand-50 border border-brand-200 text-center"
              >
                <span className="material-symbols-outlined text-emerald-600 text-[32px]">mark_email_read</span>
                <p className="font-body-md text-body-md text-brand-900">
                  Thank you! Your message has been routed to CSAM Support.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setForm({ name: "", email: "", category: "tutor", subject: "", message: "" });
                  }}
                  className="font-label-caps text-label-caps uppercase text-brand-900 hover:text-brand-700 underline underline-offset-4 transition-colors"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    labelText="Your Name"
                    type="text"
                    placeholder="Alan Turing"
                    value={form.name}
                    onChange={updateField("name")}
                    required
                  />
                  <Input
                    labelText="University Email"
                    type="email"
                    placeholder="alan.turing@university.edu"
                    value={form.email}
                    onChange={updateField("email")}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor="contact-category" className="font-label-caps text-label-caps text-on-surface-variant block">
                      User Category
                    </label>
                    <select
                      id="contact-category"
                      value={form.category}
                      onChange={updateField("category")}
                      className="w-full rounded-DEFAULT border-outline-variant bg-surface font-body-md text-body-md text-on-surface py-2 px-4 h-11 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                    >
                      <option value="tutor">Active Student Tutor</option>
                      <option value="applicant">Prospective Applicant</option>
                      <option value="convenor">Course Convenor / Lecturer</option>
                      <option value="other">General Inquiry</option>
                    </select>
                  </div>
                  <Input
                    labelText="Subject"
                    type="text"
                    placeholder="Timesheet query / Bug report"
                    value={form.subject}
                    onChange={updateField("subject")}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="contact-message" className="font-label-caps text-label-caps text-on-surface-variant block">
                    Message
                  </label>
                  <textarea
                    id="contact-message"
                    rows={4}
                    placeholder="Describe your question or issue in detail..."
                    value={form.message}
                    onChange={updateField("message")}
                    required
                    className="w-full rounded-DEFAULT border-outline-variant bg-surface font-body-md text-body-md text-on-surface placeholder:text-outline px-4 py-2 shadow-sm focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-brand-900 hover:bg-brand-800 text-white font-label-caps text-label-caps uppercase tracking-wider py-3.5 px-6 rounded-xl shadow-glow-brand transition-all active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <span>Send Message</span>
                  <span className="material-symbols-outlined text-amber-400 text-[18px]">send</span>
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Team credits (preserved from the original landing page) */}
        {/* <div className="mt-16 text-center">
          <div className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-6">
            Built by Kompile and Konquer
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto">
            {TEAM_MEMBERS.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-lowest border border-outline-variant/80 text-sm font-medium text-on-surface shadow-sm"
              >
                <span className="material-symbols-outlined text-brand-600 text-[18px]">person</span>
                {name}
              </span>
            ))}
          </div>
        </div> */}
      </div>
    </section>
  );
}
