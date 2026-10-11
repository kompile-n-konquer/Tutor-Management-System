import { Link } from "react-router-dom";
import Button from "../../components/button/Button.jsx";
import ErrorMessage from "../../components/error-message/ErrorMessage.jsx";
import { alertActionFor, formatAlertTime } from "./alertConfig.js";

/**
 * PriorityPanel
 * The unified dashboard's attention feed: urgent items first, then the
 * informational tail — exactly the order the backend sends. Every item links
 * to where its action happens (alertConfig owns that mapping).
 */

function AlertRow({ item }) {
  const action = alertActionFor(item.type);
  const when = formatAlertTime(item.at);
  const isUrgent = item.severity === "urgent";

  return (
    <li
      className={`border-l-[3px] ${
        isUrgent ? "border-urgent-orange" : "border-outline-variant"
      } bg-surface-container-lowest`}
    >
      <div className="flex flex-wrap items-start gap-x-stack-md gap-y-unit px-stack-md py-stack-md">
        <span
          className={`material-symbols-outlined text-[20px] shrink-0 ${
            isUrgent ? "text-urgent-orange" : "text-on-surface-variant"
          }`}
          style={isUrgent ? { fontVariationSettings: "'FILL' 1" } : undefined}
          aria-hidden="true"
        >
          {isUrgent ? "priority_high" : "info"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-body-md text-body-md text-on-surface">{item.title}</p>
          {item.detail && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-unit">
              {item.detail}
            </p>
          )}
        </div>

        {when && (
          <span className="font-data-mono text-data-mono text-outline shrink-0" title={item.at}>
            {when}
          </span>
        )}

        {action?.to &&
          (action.to.startsWith("#") ? (
            // In-page anchor: the decision sits further down this dashboard.
            <a
              href={action.to}
              className="ml-auto shrink-0 font-label-caps text-label-caps text-primary underline-offset-2 hover:underline"
            >
              {action.actionLabel}
            </a>
          ) : (
            <Link
              to={action.to}
              className="ml-auto shrink-0 font-label-caps text-label-caps text-primary underline-offset-2 hover:underline"
            >
              {action.actionLabel}
            </Link>
          ))}
      </div>
    </li>
  );
}

export default function PriorityPanel({
  items = [],
  isLoading = false,
  loadError = "",
  onRetry,
  lastRefreshedAt = null,
}) {
  const urgentItems = items.filter((item) => item.severity === "urgent");
  const infoItems = items.filter((item) => item.severity !== "urgent");

  return (
    <section
      aria-label="Needs your attention"
      className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-stack-md gap-y-unit px-stack-lg py-stack-md border-b border-outline-variant">
        <h2 className="font-headline-md text-headline-md text-on-surface">Needs your attention</h2>
        <p className="flex items-center gap-unit font-body-sm text-body-sm text-on-surface-variant">
          {/* A quiet live indicator: the feed re-fetches the moment the server
              signals a change, with a 30s poll as the safety net. */}
          <span className="relative inline-flex w-2 h-2" aria-hidden="true">
            <span className="absolute inline-flex w-full h-full rounded-full bg-success animate-ping opacity-60" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-success" />
          </span>
          Live
          {lastRefreshedAt &&
            ` · updated ${new Date(lastRefreshedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}`}
        </p>
      </div>

      {loadError ? (
        <div className="px-stack-lg py-stack-lg">
          <ErrorMessage>{loadError}</ErrorMessage>
          {onRetry && (
            <div className="mt-stack-md">
              <Button onClick={onRetry}>Try again</Button>
            </div>
          )}
        </div>
      ) : isLoading && items.length === 0 ? (
        <div className="space-y-unit px-stack-lg py-stack-md" aria-hidden="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-5 rounded bg-surface-container-high/60 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-stack-lg py-stack-lg">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You&rsquo;re all caught up — nothing needs your attention right now. New cover
            requests, timesheets and staffing changes appear here the moment they happen.
          </p>
        </div>
      ) : (
        <div>
          {urgentItems.length > 0 && (
            <ul className="divide-y divide-outline-variant/50">
              {urgentItems.map((item) => (
                <AlertRow key={item.id} item={item} />
              ))}
            </ul>
          )}

          {infoItems.length > 0 && (
            <div className="bg-surface-container-low">
              <p className="font-label-caps text-label-caps text-on-surface-variant uppercase px-stack-lg py-unit border-b border-outline-variant/60">
                For your information
              </p>
              <ul className="divide-y divide-outline-variant/50">
                {infoItems.map((item) => (
                  <AlertRow key={item.id} item={item} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
