import { useCallback, useEffect, useState } from "react";
import api from "../utils/axiosInstance.js";
import useAuth from "./useAuth.js";
import { connectSocket, disconnectSocket } from "../utils/socket.js";

// Realtime first, polling as the safety net: the socket refreshes the feed the
// moment the server says something changed, while the interval catches
// anything the socket missed (dropped connection, server restart, suspended
// tab).
const POLL_INTERVAL_MS = 30000;

const LOAD_ERROR_MESSAGE = "Could not load your dashboard items. Please try again later.";

/**
 * useDashboardAlerts
 * Owns the unified dashboard's priority feed: the initial load of
 * GET /api/dashboard, live refreshes on the 'dashboard:changed' socket event
 * and a 30-second polling fallback. Components render whatever the hook
 * returns; they never talk to the API or the socket themselves.
 */
export default function useDashboardAlerts() {
  const { currentUser, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const response = await api.get("/dashboard");
      if (response.status !== 200) {
        setLoadError(response.data?.message || LOAD_ERROR_MESSAGE);
        return;
      }
      setItems(response.data?.items ?? []);
      setRole(response.data?.role?.toLowerCase() ?? null);
      setLoadError("");
      setLastRefreshedAt(new Date().toISOString());
    } catch {
      setLoadError(LOAD_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for Firebase to restore the session before the first fetch — the
    // axios interceptor reads auth.currentUser at request time and would
    // otherwise send the request without a token (401 on hard refresh).
    if (authLoading || !currentUser?.uid) return undefined;
    // Wrapped so no state updates run synchronously inside the effect.
    (async () => {
      await refresh();
    })();
  }, [authLoading, currentUser?.uid, refresh]);

  useEffect(() => {
    if (authLoading || !currentUser?.uid) return undefined;

    const socket = connectSocket();
    // Any dashboard:changed signal (new cover request, submitted timesheet,
    // assignment change…) means the feed may be stale — refetch, don't patch.
    const handleChange = () => {
      refresh();
    };
    socket.on("dashboard:changed", handleChange);
    const poll = setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      socket.off("dashboard:changed", handleChange);
      clearInterval(poll);
      // The dashboard owns the connection while mounted; leaving the page
      // closes it so no refresh signals keep firing in the background.
      disconnectSocket();
    };
  }, [authLoading, currentUser?.uid, refresh]);

  return { items, role, isLoading, loadError, lastRefreshedAt, refresh };
}
