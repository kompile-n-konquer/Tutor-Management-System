import { describe, test, expect, vi } from 'vitest';
import axios from 'axios';

const { requestUse, responseUse, instance } = vi.hoisted(() => {
  const requestUse = vi.fn();
  const responseUse = vi.fn();
  const instance = {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
    request: vi.fn(),
  };
  return { requestUse, responseUse, instance };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => instance),
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
const responseInterceptor = () => responseUse.mock.calls[0][0];

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

  test('registers a single response interceptor', () => {
    expect(responseUse).toHaveBeenCalledTimes(1);
    expect(typeof responseInterceptor()).toBe('function');
    expect(typeof responseUse.mock.calls[0][1]).toBe('function');
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

describe('axiosInstance — 401 token refresh and single retry', () => {
  test('force-refreshes the token and replays the request once on a 401', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'fresh-token') };
    api.request.mockClear();

    const config = { headers: {} };
    await responseInterceptor()({ status: 401, config });

    expect(authState.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(config.headers.Authorization).toBe('Bearer fresh-token');
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith(config);
  });

  test('does not retry a 401 that already followed a retry', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'fresh-token') };
    api.request.mockClear();

    const response = { status: 401, config: { headers: {}, _retried401: true } };
    const result = await responseInterceptor()(response);

    expect(result).toBe(response);
    expect(api.request).not.toHaveBeenCalled();
    expect(authState.currentUser.getIdToken).not.toHaveBeenCalled();
  });

  test('passes non-401 responses through untouched', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'token') };
    api.request.mockClear();

    const response = { status: 500, config: { headers: {} } };
    const result = await responseInterceptor()(response);

    expect(result).toBe(response);
    expect(api.request).not.toHaveBeenCalled();
  });

  test('surfaces the 401 when nobody is signed in', async () => {
    authState.currentUser = null;
    api.request.mockClear();

    const response = { status: 401, config: { headers: {} } };
    const result = await responseInterceptor()(response);

    expect(result).toBe(response);
    expect(api.request).not.toHaveBeenCalled();
  });

  test('surfaces the 401 when the token refresh itself fails', async () => {
    authState.currentUser = {
      getIdToken: vi.fn(async () => {
        throw new Error('refresh failed');
      }),
    };
    api.request.mockClear();

    const response = { status: 401, config: { headers: {} } };
    const result = await responseInterceptor()(response);

    expect(result).toBe(response);
    expect(api.request).not.toHaveBeenCalled();
  });
});
