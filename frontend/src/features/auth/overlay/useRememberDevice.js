import { useCallback, useState } from "react";

import {
  applyRememberDevicePersistence,
  readRememberDevicePreference,
  writeRememberDevicePreference,
} from "./rememberDevice.js";

/**
 * useRememberDevice — shared state for the overlay's "Remember this Device"
 * control. The preference persists to localStorage on every change, and
 * applyPersistenceChoice() re-points Firebase Auth at the matching storage
 * tier right before a sign-in / sign-up attempt.
 */
export default function useRememberDevice() {
  const [rememberDevice, setRememberDeviceState] = useState(readRememberDevicePreference);

  const setRememberDevice = useCallback((remember) => {
    setRememberDeviceState(remember);
    writeRememberDevicePreference(remember);
  }, []);

  const applyPersistenceChoice = useCallback(
    () => applyRememberDevicePersistence(rememberDevice),
    [rememberDevice],
  );

  return { rememberDevice, setRememberDevice, applyPersistenceChoice };
}
