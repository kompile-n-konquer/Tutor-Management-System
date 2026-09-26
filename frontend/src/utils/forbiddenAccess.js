// App-wide event fired when the backend answers 403 for a resource the
// signed-in user may not access (e.g. a course owned by another lecturer).
// ForbiddenGate listens for it and swaps the page for the 404 ErrorPage.
export const FORBIDDEN_EVENT = 'app:forbidden';

export function notifyForbidden() {
  window.dispatchEvent(new Event(FORBIDDEN_EVENT));
}

// Resource-detail endpoints where a 403 means "this resource is not yours".
// Masking these as 404 keeps ownership private, mirroring how the ErrorPage
// handles unknown routes. Business-rule 403s (application marks/hours limits)
// and auth endpoints are deliberately not listed, so their inline messages
// keep working.
const RESOURCE_PATTERNS = [/^\/courses\/\d+/, /^\/events\/\d+/, /^\/timesheets\/\d+/];

export function isForbiddenResource(status, url = '') {
  return status === 403 && RESOURCE_PATTERNS.some((pattern) => pattern.test(url));
}
