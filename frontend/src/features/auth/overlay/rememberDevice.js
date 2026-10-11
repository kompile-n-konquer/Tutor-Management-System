import { browserLocalPersistence, browserSessionPersistence, setPersistence } from "firebase/auth";

import { auth } from "../../../firebase/firebase.js";

/**
 * rememberDevice — the persistence layer behind the overlay's "Remember this
 * Device" control. Firebase Auth is what actually keeps a trusted device
 * signed in: the Local tier stores the refresh token in localStorage, so a
 * returning visitor is silently re-authenticated without re-entering
 * credentials; the Session tier drops it when the tab closes.
 *
 * The user's choice is mirrored into localStorage so the checkbox keeps its
 * setting between visits, but the trusted state itself lives only in the
 * Firebase session — no custom device token is minted here.
 */
export const REMEMBER_DEVICE_STORAGE_KEY = "tutorflow-remember-device";

// Local persistence is Firebase's default and the app's pre-existing
// behaviour, so an unset preference keeps the remembered state (opt-out).
export function readRememberDevicePreference() {
  try {
    const stored = window.localStorage.getItem(REMEMBER_DEVICE_STORAGE_KEY);
    if (stored === "false") return false;
    return true;
  } catch {
    // Storage unavailable (private browsing, embedded webview) — keep the
    // remembered default; the in-memory toggle still works for this visit.
    return true;
  }
}

export function writeRememberDevicePreference(remember) {
  try {
    window.localStorage.setItem(REMEMBER_DEVICE_STORAGE_KEY, remember ? "true" : "false");
  } catch {
    // Non-fatal — the choice still applies to this visit via React state.
  }
}

/**
 * Point Firebase Auth at the persistence tier that matches the choice.
 * Must resolve before signInWith* / createUserWith* so the session is stored
 * in the right place from the start.
 */
export async function applyRememberDevicePersistence(remember) {
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    // Best effort: if the browser refuses the requested storage tier Firebase
    // keeps its current default and sign-in continues — never block auth here.
  }
}
