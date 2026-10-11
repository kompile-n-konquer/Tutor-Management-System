/**
 * AuthRedirectSkeleton — the overlay's in-place loading state. Shown between
 * a successful Firebase sign-in and the hand-off to the role's dashboard: it
 * keeps the overlay covering the landing page while the profile role is
 * resolved, then navigation and the overlay close land in the same commit so
 * the landing page never flashes back up in between.
 *
 * The pulse bars mirror the shape of the auth forms and use the same
 * animate-pulse treatment as every other loading state in the app
 * (LecturerView, TimesheetsContent, TutorDashboardContent).
 */
export default function AuthRedirectSkeleton() {
  return (
    <div className="w-full max-w-md mx-auto space-y-5 my-auto" aria-live="polite" aria-busy="true">
      <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider text-center">
        Preparing your dashboard…
      </p>
      <div className="space-y-4" aria-hidden="true">
        <div className="h-8 w-2/3 rounded bg-surface-container-high animate-pulse" />
        <div className="h-11 rounded-lg bg-surface-container-high/60 animate-pulse" />
        <div className="h-11 rounded-lg bg-surface-container-high/60 animate-pulse" />
        <div className="h-12 rounded-xl bg-surface-container-high animate-pulse" />
        <div className="h-12 rounded-xl bg-surface-container-high/60 animate-pulse" />
      </div>
    </div>
  );
}
