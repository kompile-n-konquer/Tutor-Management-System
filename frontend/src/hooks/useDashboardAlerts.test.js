import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockGet, mockConnectSocket, mockDisconnectSocket, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockConnectSocket: vi.fn(),
  mockDisconnectSocket: vi.fn(),
  authState: { currentUser: { uid: 'u1' }, loading: false },
}));

vi.mock('../utils/axiosInstance.js', () => ({ default: { get: mockGet } }));
vi.mock('../utils/socket.js', () => ({
  connectSocket: mockConnectSocket,
  disconnectSocket: mockDisconnectSocket,
}));
vi.mock('./useAuth.js', () => ({
  default: () => authState,
}));

import useDashboardAlerts from './useDashboardAlerts.js';

// A socket double that records the registered 'dashboard:changed' listeners.
const makeSocket = () => {
  const listeners = new Map();
  return {
    on: vi.fn((event, handler) => listeners.set(event, handler)),
    off: vi.fn((event, handler) => {
      if (listeners.get(event) === handler) listeners.delete(event);
    }),
    emitDashboardChange: () => listeners.get('dashboard:changed')?.(),
    listenerCount: () => listeners.size,
  };
};

const feed = (items, role = 'TUTOR') => ({ status: 200, data: { role, items } });

describe('useDashboardAlerts — the dashboard priority feed', () => {
  let socket;

  beforeEach(() => {
    // shouldAdvanceTime lets waitFor's poll interval tick on real elapsed time
    // while advanceTimersByTime stays deterministic for the 30s poll checks.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    socket = makeSocket();
    mockConnectSocket.mockReturnValue(socket);
    authState.currentUser = { uid: 'u1' };
    authState.loading = false;
  });

  afterEach(async () => {
    // Let any in-flight refresh settle before the fake clock goes away.
    await act(async () => {});
    vi.useRealTimers();
  });

  test('loads the feed once auth is ready and exposes items, role and freshness', async () => {
    mockGet.mockResolvedValue(
      feed([{ id: 'swap-1', type: 'swap-incoming', severity: 'urgent', title: 'Cover swap from Riya', detail: 'CS101', at: '2026-10-01T10:00:00.000Z' }]),
    );

    const { result } = renderHook(() => useDashboardAlerts());

    await act(async () => {}); // flush the initial fetch

    expect(mockGet).toHaveBeenCalledWith('/dashboard');
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].title).toBe('Cover swap from Riya');
    expect(result.current.role).toBe('tutor');
    expect(result.current.loadError).toBe('');
    expect(result.current.lastRefreshedAt).not.toBeNull();
  });

  test('waits for Firebase to restore the session before fetching or connecting', async () => {
    authState.currentUser = null;
    authState.loading = true;

    const { result } = renderHook(() => useDashboardAlerts());

    // Nothing ran: no request, no socket, still in the loading state.
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockConnectSocket).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });

  test('a non-200 response surfaces the server message', async () => {
    mockGet.mockResolvedValue({ status: 403, data: { message: 'You are not permitted' } });

    const { result } = renderHook(() => useDashboardAlerts());

    await act(async () => {}); // flush the initial fetch
    expect(result.current.loadError).toBe('You are not permitted');
    expect(result.current.items).toEqual([]);
  });

  test('a thrown request surfaces the friendly message', async () => {
    mockGet.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useDashboardAlerts());

    await act(async () => {}); // flush the initial fetch
    expect(result.current.loadError).toBe(
      'Could not load your dashboard items. Please try again later.',
    );
  });

  test("subscribes to the socket's dashboard:changed and refetches on every signal", async () => {
    mockGet.mockResolvedValue(feed([]));

    const { result } = renderHook(() => useDashboardAlerts());
    await act(async () => {}); // let the initial fetch land

    expect(mockConnectSocket).toHaveBeenCalledTimes(1);
    expect(socket.on).toHaveBeenCalledWith('dashboard:changed', expect.any(Function));

    // A new cover request lands → the feed refetches without a manual refresh.
    await act(async () => {
      socket.emitDashboardChange();
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    await act(async () => {
      socket.emitDashboardChange();
      socket.emitDashboardChange();
    });
    expect(mockGet).toHaveBeenCalledTimes(4);
    expect(result.current.loadError).toBe('');
  });

  test('polls every 30 seconds as the socket fallback', async () => {
    mockGet.mockResolvedValue(feed([]));

    renderHook(() => useDashboardAlerts());
    await act(async () => {}); // let the initial fetch land

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(mockGet).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  test('unmounting detaches the listener, stops the poll and closes the socket', async () => {
    mockGet.mockResolvedValue(feed([]));

    const { unmount } = renderHook(() => useDashboardAlerts());
    await act(async () => {}); // let the initial fetch land

    act(() => unmount());

    expect(socket.off).toHaveBeenCalledWith('dashboard:changed', expect.any(Function));
    expect(mockDisconnectSocket).toHaveBeenCalledTimes(1);

    const calls = mockGet.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(120000);
    });
    // No polling — and no socket handler — outlives the page.
    expect(mockGet).toHaveBeenCalledTimes(calls);
    expect(socket.listenerCount()).toBe(0);
  });

  test('refresh() re-runs the fetch on demand (the error retry button)', async () => {
    mockGet.mockResolvedValueOnce({ status: 500, data: {} });
    mockGet.mockResolvedValueOnce(feed([{ id: 'x', type: 'swap-review', severity: 'urgent', title: 'Swap', detail: '', at: null }], 'ORGANISER'));

    const { result } = renderHook(() => useDashboardAlerts());
    await act(async () => {}); // let the failed load land
    expect(result.current.loadError).not.toBe('');

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.loadError).toBe('');
    expect(result.current.role).toBe('organiser');
    expect(result.current.items).toHaveLength(1);
  });
});
