import { describe, test, expect, vi, beforeEach } from 'vitest';

const { mockIo, mockAuth } = vi.hoisted(() => ({
  mockIo: vi.fn(),
  mockAuth: { currentUser: null },
}));

vi.mock('socket.io-client', () => ({ io: mockIo }));
vi.mock('../firebase/firebase.js', () => ({ auth: mockAuth }));

import {
  connectSocket,
  getSocket,
  disconnectSocket,
  connectOrganiserSocket,
} from './socket.js';

const makeSocket = () => ({
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
});

// The module keeps one socket for the whole app; reset it between tests so
// each case starts from a clean singleton.
beforeEach(() => {
  mockIo.mockReset();
  mockAuth.currentUser = null;
  disconnectSocket();
});

describe('connectSocket — the shared realtime connection', () => {
  test('creates the socket once, unconnected, with the synchronous auth callback', () => {
    const socket = makeSocket();
    mockIo.mockReturnValue(socket);

    expect(connectSocket()).toBe(socket);
    expect(connectSocket()).toBe(socket);
    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ autoConnect: false, transports: ['websocket', 'polling'] }),
    );
    // No Firebase user: the connection opens straight away with whatever
    // token the (still null) cache would hand the auth callback.
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  test('the auth callback hands over the cached token synchronously', () => {
    const socket = makeSocket();
    mockIo.mockReturnValue(socket);
    connectSocket();

    const options = mockIo.mock.calls[0][1];
    const cb = vi.fn();
    options.auth(cb);

    expect(cb).toHaveBeenCalledWith({ token: null });
  });

  test('a signed-in user connects with the freshly fetched ID token', async () => {
    const socket = makeSocket();
    mockIo.mockReturnValue(socket);
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue('id-token-1') };

    connectSocket();
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalled());

    expect(mockAuth.currentUser.getIdToken).toHaveBeenCalled();
    expect(socket.auth).toEqual({ token: 'id-token-1' });
    // The token lands in the cache before the connection opens, so a
    // reconnection attempt replays the working payload.
    const cb = vi.fn();
    mockIo.mock.calls[0][1].auth(cb);
    expect(cb).toHaveBeenCalledWith({ token: 'id-token-1' });
  });

  test('a failing token fetch still opens the connection', async () => {
    const socket = makeSocket();
    mockIo.mockReturnValue(socket);
    mockAuth.currentUser = { getIdToken: vi.fn().mockRejectedValue(new Error('offline')) };

    connectSocket();
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalled());
  });

  test('getSocket exposes the live socket and null once disconnected', () => {
    expect(getSocket()).toBeNull();

    const socket = makeSocket();
    mockIo.mockReturnValue(socket);
    connectSocket();

    expect(getSocket()).toBe(socket);

    disconnectSocket();
    expect(getSocket()).toBeNull();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);

    // The next connect builds a brand-new socket instead of reusing the
    // disconnected one.
    const fresh = makeSocket();
    mockIo.mockReturnValue(fresh);
    expect(connectSocket()).toBe(fresh);
  });

  test('the organiser board aliases point at the same shared connection', () => {
    const socket = makeSocket();
    mockIo.mockReturnValue(socket);

    expect(connectOrganiserSocket()).toBe(socket);
    expect(connectOrganiserSocket()).toBe(getSocket());
  });
});
