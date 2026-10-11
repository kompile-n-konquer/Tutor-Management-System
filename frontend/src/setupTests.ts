import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// findBy*/waitFor default to only 1s. On the contended CI runner a state
// update after a mocked fetch can take longer than that to land, so give the
// async queries the same headroom as the raised vitest test timeout.
configure({ asyncUtilTimeout: 5000 });

/*
 * Node >= 25 ships an experimental global `localStorage` that is defective
 * when the runtime is launched without a valid --localstorage-file (its
 * clear/getItem methods are undefined) — on those machines the broken shim
 * leaks into the jsdom window and any test touching localStorage crashes.
 * Detect the defective shim and swap in a minimal in-memory Storage; healthy
 * environments keep whatever storage they already have.
 */
const nativeStorage = (globalThis as { localStorage?: Storage }).localStorage;
if (typeof nativeStorage !== 'object' || nativeStorage === null || typeof nativeStorage.clear !== 'function') {
  const store = new Map<string, string>();
  const inMemoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
  };
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: inMemoryStorage, configurable: true });
    Object.defineProperty(window, 'localStorage', { value: inMemoryStorage, configurable: true });
  } catch {
    // Non-configurable storage on some engines — leave it untouched.
  }
}
