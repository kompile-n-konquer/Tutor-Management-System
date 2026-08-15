import AppLayout from "../components/layout/AppLayout";

export default function Placeholder({ role = "tutor", label = "Page" }) {
  return (
    <AppLayout role={role} title="Tutor Management System">
      <div className="p-margin-page max-w-container-max mx-auto w-full">
        <div className="bg-surface-container-lowest border border-dashed border-outline-variant rounded-xl p-stack-lg text-center">
          <h2 className="font-headline-md text-headline-md text-on-surface mb-2">{label}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            This screen hasn't been built yet — flagged in the backlog as a later-priority page.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}