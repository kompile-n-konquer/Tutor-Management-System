import { describe, test, expect, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const { mockApp, mockAuth } = vi.hoisted(() => ({
  mockApp: { name: '[DEFAULT]' },
  mockAuth: { currentUser: null },
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => mockApp),
  FirebaseError: class FakeFirebaseError extends Error {},
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mockAuth),
}));

import { app, auth } from './firebase.js';

describe('firebase module — single app instance + auth handle', () => {
  test('initialises the app once with the environment configuration', () => {
    expect(initializeApp).toHaveBeenCalledTimes(1);
    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      }),
    );
    expect(app).toBe(mockApp);
  });

  test('exposes the auth instance bound to that app', () => {
    expect(getAuth).toHaveBeenCalledWith(mockApp);
    expect(auth).toBe(mockAuth);
  });
});
