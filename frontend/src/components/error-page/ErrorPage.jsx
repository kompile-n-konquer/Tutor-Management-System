import { useRouteError, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError();
  // Rendered as the "*" catch-all route there is no route error, so it is a 404.
  const notFound = !error || error?.status === 404;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-stack-md bg-background text-on-surface font-body-md p-margin-page">
      <h1 className="font-headline-lg text-headline-lg">
        {notFound ? "Page not found" : "Something went wrong"}
      </h1>
      <p className="font-body-md text-on-surface-variant">
        {error?.statusText ||
          error?.message ||
          (notFound
            ? "The page you are looking for does not exist."
            : "An unexpected error occurred.")}
      </p>
      <Link to="/" className="text-primary hover:underline font-label-caps text-label-caps">
        Back to Home
      </Link>
    </div>
  );
}