import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// socket.js keeps module-level singleton state (socket + cachedToken), so every
// test cleans up through disconnectOrganiserSocket() in afterEach.
const ioMock = vi.hoisted(() => vi.fn());
const authState = vi.hoisted(() => ({ currentUser: null }));

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('../firebase/firebase.js', () => ({ auth: authState }));

import {
  connectOrganiserSocket,
  getOrganiserSocket,
  disconnectOrganiserSocket,
} from './socket.js';

const makeSocket = () => ({
  connected: false,
  auth: undefined,
  connect: vi.fn(),
  disconnect: vi.fn(),
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('socket — organiser board connection singleton', () => {
  beforeEach(() => {
    ioMock.mockReset();
    ioMock.mockImplementation(() => makeSocket());
    authState.currentUser = null;
  });

  afterEach(() => {
    disconnectOrganiserSocket();
  });

  test('creates the socket once, refreshes the auth payload and connects', async () => {
    authState.currentUser = { getIdToken: vi.fn(async () => 'tok-1') };

    const first = connectOrganiserSocket();
    const second = connectOrganiserSocket();

    expect(second).toBe(first); // singleton: io() ran exactly once
    expect(ioMock).toHaveBeenCalledTimes(1);
    const [url, options] = ioMock.mock.calls[0];
    expect(url).toEqual(expect.any(String));
    expect(options.autoConnect).toBe(false); // handshake held until token ready
    expect(options.transports).toEqual(['websocket', 'polling']);

    // The sync auth callback serves the cached token (null before it lands).
    let payload;
    options.auth((p) => {
      payload = p;
    });
    expect(payload).toEqual({ token: null });

    await flush(); // getIdToken resolves

    expect(authState.currentUser.getIdToken).toHaveBeenCalledTimes(1);
    expect(first.auth).toEqual({ token: 'tok-1' }); // refreshed before opening
    expect(first.connect).toHaveBeenCalledTimes(1);
    options.auth((p) => {
      payload = p;
    });
    expect(payload).toEqual({ token: 'tok-1' });
  });

  test('skips the auth refresh when the socket is already connected', async () => {
    authState.currentUser = { getIdToken: async () => 'tok-2' };

    const socket = connectOrganiserSocket();
    socket.connected = true;
    await flush();

    expect(socket.auth).toBeUndefined(); // handshake payload left untouched
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  test('connects immediately when nobody is signed in', () => {
    authState.currentUser = null;

    const socket = connectOrganiserSocket();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(getOrganiserSocket()).toBe(socket);
  });

  test('still connects when fetching the token fails', async () => {
    authState.currentUser = {
      getIdToken: vi.fn(async () => {
        throw new Error('offline');
      }),
    };

    const socket = connectOrganiserSocket();
    await flush();

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.auth).toBeUndefined();
  });

  test('disconnect resets the singleton, the token cache and allows a fresh connect', async () => {
    disconnectOrganiserSocket(); // no socket yet — must be a safe no-op
    expect(getOrganiserSocket()).toBeNull();

    authState.currentUser = { getIdToken: async () => 'tok-3' };
    const first = connectOrganiserSocket();
    await flush();

    disconnectOrganiserSocket();

    expect(first.disconnect).toHaveBeenCalledTimes(1);
    expect(getOrganiserSocket()).toBeNull();

    // Reconnecting builds a brand-new socket without the stale cached token.
    authState.currentUser = { getIdToken: async () => 'tok-4' };
    const second = connectOrganiserSocket();
    expect(second).not.toBe(first);
    expect(ioMock).toHaveBeenCalledTimes(2);

    await flush();
    let payload;
    ioMock.mock.calls[1][1].auth((p) => {
      payload = p;
    });
    expect(payload).toEqual({ token: 'tok-4' });
  });

  test('a late token or failure after a disconnect must not resurrect the socket', async () => {
    let resolveToken;
    authState.currentUser = {
      getIdToken: () => new Promise((resolve) => (resolveToken = resolve)),
    };
    connectOrganiserSocket();
    disconnectOrganiserSocket(); // the socket is gone before the token lands

    resolveToken('late-token');
    await flush(); // must not throw on the null socket

    expect(getOrganiserSocket()).toBeNull();

    // Same for a rejection arriving after the disconnect.
    let rejectToken;
    authState.currentUser = {
      getIdToken: () => new Promise((_, reject) => (rejectToken = reject)),
    };
    connectOrganiserSocket();
    const orphan = getOrganiserSocket();
    disconnectOrganiserSocket();

    rejectToken(new Error('late failure'));
    await flush();

    expect(getOrganiserSocket()).toBeNull();
    expect(orphan.connect).not.toHaveBeenCalled();
  });
});
