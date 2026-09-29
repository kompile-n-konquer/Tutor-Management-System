import { describe, test, expect, vi } from 'vitest';
import axios from 'axios';

const { requestUse } = vi.hoisted(() => ({ requestUse: vi.fn() }));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ interceptors: { request: { use: requestUse } } })),
  },
}));

// The firebase.js module captures the auth object at import time, so we expose
// currentUser through a getter that reads whatever the test currently sets.
const { authState } = vi.hoisted(() => ({ authState: { currentUser: null } }));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  FirebaseError: class FakeFirebaseError extends Error {},
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => authState),
}));

import api from './axiosInstance.js';

const interceptor = () => requestUse.mock.calls[0][0];

describe('axiosInstance — API client with Firebase auth attached', () => {
  test('creates the client with a permissive validateStatus so responses never throw', () => {
    expect(axios.create).toHaveBeenCalledTimes(1);
    const options = axios.create.mock.calls[0][0];
    expect(options.baseURL).toBe(import.meta.env.VITE_BACKEND_BASE_URL);
    expect(options.validateStatus()).toBe(true);
  });

  test('registers a single request interceptor', () => {
    expect(requestUse).toHaveBeenCalledTimes(1);
    expect(typeof interceptor()).toBe('function');
  });

  test('attaches the Firebase ID token as a Bearer header for signed-in users', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'token-123') };

    const config = { headers: {} };
    const result = await interceptor()(config);

    expect(authState.currentUser.getIdToken).toHaveBeenCalledTimes(1);
    expect(config.headers.Authorization).toBe('Bearer token-123');
    expect(result).toBe(config);
  });

  test('leaves the request untouched when nobody is signed in', async () => {
    authState.currentUser = null;

    const config = { headers: {} };
    const result = await interceptor()(config);

    expect(config.headers.Authorization).toBeUndefined();
    expect(result).toBe(config);
  });

  test('keeps an Authorization header that is already set', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'fresh-token') };

    const config = { headers: { Authorization: 'Bearer existing-token' } };
    const result = await interceptor()(config);

    // The interceptor must not overwrite a caller-provided header.
    expect(authState.currentUser.getIdToken).not.toHaveBeenCalled();
    expect(config.headers.Authorization).toBe('Bearer existing-token');
    expect(result).toBe(config);
  });
});
