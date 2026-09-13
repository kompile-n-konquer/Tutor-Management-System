import { useState } from "react";

/**
 * OnboardingWalkthrough
 * Generic step-by-step modal — pass in `steps` (array of {title, body}) and
 * `onDismiss`. Used by TutorDashboard for the first-login walkthrough, but
 * reusable for an organiser or student onboarding flow later.
 */
export default function OnboardingWalkthrough({ steps, onDismiss }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-gutter">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-stack-lg relative">
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface"
          aria-label="Skip walkthrough"
        >
          <span className="material-symbols-outlined">close</span>
        </button>

        <span className="font-label-caps text-label-caps text-primary uppercase">
          Step {stepIndex + 1} of {steps.length}
        </span>
        <h2 className="font-headline-md text-headline-md text-on-surface mt-2 mb-2">{step.title}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-stack-lg">{step.body}</p>

        <div className="flex items-center justify-between">
          <button onClick={onDismiss} className="font-label-caps text-label-caps text-on-surface-variant hover:text-on-surface">
            Skip
          </button>
          <div className="flex gap-stack-sm">
            {stepIndex > 0 && (
              <button
                onClick={() => setStepIndex((i) => i - 1)}
                className="px-stack-md py-stack-sm rounded-lg border border-outline-variant font-label-caps text-label-caps hover:bg-surface-variant transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? onDismiss() : setStepIndex((i) => i + 1))}
              className="px-stack-md py-stack-sm rounded-lg bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary-container transition-colors"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}