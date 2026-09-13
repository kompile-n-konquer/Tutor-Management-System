import { useEffect, useState } from "react";

// Tracks whether a given onboarding flow has been seen before, per browser.
// `key` scopes it (e.g. "tutor-dashboard") so different walkthroughs don't collide.
export function useFirstVisit(key) {
  const storageKey = `csam_onboarding_${key}`;
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) setIsFirstVisit(true);
  }, [storageKey]);

  function markSeen() {
    localStorage.setItem(storageKey, "true");
    setIsFirstVisit(false);
  }

  return { isFirstVisit, markSeen };
}