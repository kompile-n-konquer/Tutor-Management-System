import { useRouteError, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-stack-md bg-background text-on-surface font-body-md p-margin-page">
      <h1 className="font-headline-lg text-headline-lg">Something went wrong</h1>
      <p className="font-body-md text-on-surface-variant">
        {error?.statusText || error?.message || "An unexpected error occurred."}
      </p>
      <Link to="/" className="text-primary hover:underline font-label-caps text-label-caps">
        Back to Home
      </Link>
    </div>
  );
}