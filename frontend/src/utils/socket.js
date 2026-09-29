import { io } from "socket.io-client";
import { auth } from "../firebase/firebase.js";

// axiosInstance uses VITE_BACKEND_BASE_URL = ".../api"; sockets connect to the
// server root, so strip the /api suffix.
const SOCKET_URL = (import.meta.env.VITE_BACKEND_BASE_URL || "").replace(/\/api\/?$/, "");

let socket = null;
let cachedToken = null;

/**
 * Connects (once) to the organiser board socket. The server verifies the
 * Firebase ID token at handshake and only admits ORGANISER/ADMIN users.
 *
 * socket.io's `auth` option only supports a SYNCHRONOUS callback, so the
 * token is fetched from Firebase first (autoConnect: false holds the
 * handshake until it is ready) and cached for subsequent reconnections.
 */
export function connectOrganiserSocket() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    autoConnect: false,
    auth: (cb) => cb({ token: cachedToken }),
    transports: ["websocket", "polling"],
  });
  const user = auth.currentUser;
  if (user) {
    user
      .getIdToken()
      .then((token) => {
        cachedToken = token;
        // Socket may already be mid-handshake with a null token — refresh the
        // payload before opening the connection so the first attempt succeeds.
        if (socket && !socket.connected) socket.auth = { token };
        socket?.connect();
      })
      .catch(() => socket?.connect());
  } else {
    socket.connect();
  }
  return socket;
}

export function getOrganiserSocket() {
  return socket;
}

export function disconnectOrganiserSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    cachedToken = null;
  }
}
