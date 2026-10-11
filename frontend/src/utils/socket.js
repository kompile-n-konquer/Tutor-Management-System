import { io } from "socket.io-client";
import { auth } from "../firebase/firebase.js";

// axiosInstance uses VITE_BACKEND_BASE_URL = ".../api"; sockets connect to the
// server root, so strip the /api suffix.
const SOCKET_URL = (import.meta.env.VITE_BACKEND_BASE_URL || "").replace(/\/api\/?$/, "");

let socket = null;
let cachedToken = null;

/**
 * Connects (once) to the app's realtime socket. The server verifies the
 * Firebase ID token at handshake and admits every authenticated user; what
 * each connected role may then receive is decided server-side per event
 * (organisers keep the board rooms, everyone gets their own user room).
 *
 * socket.io's `auth` option only supports a SYNCHRONOUS callback, so the
 * token is fetched from Firebase first (autoConnect: false holds the
 * handshake until it is ready) and cached for subsequent reconnections.
 */
export function connectSocket() {
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

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    cachedToken = null;
  }
}

// The organiser board was this socket's first consumer — its imports keep
// working against the same shared connection under the generic names.
export const connectOrganiserSocket = connectSocket;
export const getOrganiserSocket = getSocket;
export const disconnectOrganiserSocket = disconnectSocket;
