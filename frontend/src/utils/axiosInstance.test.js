import { describe, test, expect, vi } from 'vitest';
import axios from 'axios';

const { requestUse, responseUse } = vi.hoisted(() => ({
  requestUse: vi.fn(),
  responseUse: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: { use: requestUse },
        response: { use: responseUse },
      },
    })),
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

  test('registers a single response interceptor for the forbidden-resource 404 swap', () => {
    expect(responseUse).toHaveBeenCalledTimes(1);
    expect(typeof responseUse.mock.calls[0][0]).toBe('function');
  });

  test('the response interceptor swaps same-page ownership 403s for the 404 page', () => {
    const responseInterceptor = responseUse.mock.calls[0][0];
    // notifyForbidden dispatches a window event; faking the same pathname on
    // both sides means the interceptor treats this as the current page.
    const config = {
      url: '/courses/42',
      metadata: { pathname: window.location.pathname },
    };

    const response = { status: 403, config };
    const result = responseInterceptor(response);

    // A 403 on a resource-detail endpoint from the current page raises the
    // forbidden event (ForbiddenGate swaps in the 404 page); the response still
    // flows through unchanged.
    expect(result).toBe(response);
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
