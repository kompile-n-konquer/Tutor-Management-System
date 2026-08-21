import { Link } from "react-router-dom";

export default function AuthLayout({ heading, description, children, footerPrompt, footerLinkText, footerLinkTo }) {
  return (
    <div className="bg-background min-h-screen text-on-surface font-body-md flex antialiased">
      <div className="flex min-h-screen w-full">
        <div
          className="hidden lg:flex lg:w-1/2 relative overflow-hidden p-margin-page flex-col justify-between text-white"
          style={{
            background: "linear-gradient(135deg, #4B0082 0%, #FF8C00 100%)",
          }}
        >
          {/* <div className="absolute -top-32 -left-32 w-96 h-96 bg-white/10 rounded-full blur-[100px]" /> */}
          {/*<div className="absolute -bottom-32 -right-32 w-96 h-96 bg-white/10 rounded-full blur-[100px]" /> */}

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-stack-lg">
              <span className="material-symbols-outlined text-[32px]">school</span>
              <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight">Tutor Flow</h1>
            </div>
          </div>

          <div className="relative z-10 max-w-md">
            <h2 className="font-display text-display mb-stack-md leading-tight">{heading}</h2>
            <p className="font-body-lg text-body-lg text-white/80">{description}</p>
          </div>

          <div className="relative z-10 flex gap-4 text-white/80">
            <div className="flex flex-col gap-1">
              <span className="font-label-caps text-label-caps uppercase opacity-70">Support</span>
              <span className="font-body-sm text-body-sm">csam.help@university.edu</span>
            </div>
          </div>
        </div>

        <div className="flex w-full lg:w-1/2 items-center justify-center p-margin-page bg-surface-container-lowest shadow-[-20px_0_40px_rgba(0,0,0,0.05)] relative z-20">
          <div className="w-full max-w-[440px] space-y-stack-lg">
            <div className="text-center lg:text-left space-y-unit">
              <div className="flex items-center justify-center lg:hidden gap-2 mb-stack-md">
                <span className="material-symbols-outlined text-[32px] text-primary">school</span>
                <h1 className="font-headline-md text-headline-md text-primary font-bold">Tutor Flow</h1>
              </div>

              <Link to="/" className="inline-flex items-center gap-1 mt-3 text-primary hover:text-primary-container transition-colors font-body-sm">
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                Back to Home
              </Link>

              <h2 className="font-headline-lg text-headline-lg text-on-surface">{heading}</h2>
            </div>

            {children}

            <div className="text-center pt-stack-md border-t border-surface-variant mt-stack-lg">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {footerPrompt}
                <Link to={footerLinkTo} className="font-label-caps text-label-caps text-primary hover:text-primary-container hover:underline transition-colors ml-1">
                  {footerLinkText}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}