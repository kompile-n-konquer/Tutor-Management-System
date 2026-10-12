const { Server } = require('socket.io');
const getFirebaseAdmin = require('../firebase/admin');
const prisma = require('../prisma/client');
const { normaliseRole } = require('../utils/roles');

// Organisers connected to the board right now: socketId -> { id, name, email }.
// Presence stays organiser-only — it powers the board's "who else is dragging"
// indicator, which only makes sense for the roles that share the board.
const presence = new Map();

let io = null;

function presenceList() {
  // One entry per organiser (dedupe multiple tabs / devices by user id)
  const byUser = new Map();
  for (const entry of presence.values()) byUser.set(entry.id, entry);
  return [...byUser.values()].map(({ id, name, email }) => ({ id, name, email }));
}

function broadcastPresence() {
  const organisers = presenceList();
  for (const [socketId, entry] of presence) {
    // Everyone sees the full list; the client uses `self` to spot itself.
    io.to(socketId).emit('presence:list', { organisers, selfId: entry.id });
  }
}

function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  // Authenticate the handshake the same way the REST middleware does: a
  // Firebase ID token in socket.handshake.auth.token, looked up against the
  // User table. Every authenticated role is admitted — each socket joins its
  // own `user:{id}` room so controllers can push dashboard refresh signals to
  // exactly the people a change affects, on every device they have open.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Missing auth token'));

      const { getAuth } = getFirebaseAdmin();
      const decoded = await getAuth().verifyIdToken(token);

      const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
      if (!user) return next(new Error('User not found'));

      socket.data.user = {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: normaliseRole(user.role),
      };
      next();
    } catch (error) {
      next(new Error('Invalid Firebase ID token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;

    // Everyone gets their own room: targeted events land on every device the
    // user has open without ever reaching anyone else.
    socket.join(`user:${user.id}`);

    // The board room and its presence list stay organiser/admin-only — tutors
    // and lecturers never receive board drag events.
    const isOrganiser = user.role === 'ORGANISER' || user.role === 'ADMIN';
    if (isOrganiser) {
      presence.set(socket.id, user);
      socket.join('organisers');
      broadcastPresence();
    }

    // Drag presence: tell every OTHER organiser that this user started or
    // stopped dragging a tutor card.
    socket.on('board:drag', ({ applicantId, applicantName, courseId, pool } = {}) => {
      if (!isOrganiser) return;
      socket.to('organisers').emit('presence:drag', {
        userId: user.id,
        name: user.name,
        applicantId,
        applicantName,
        courseId,
        pool,
      });
    });

    socket.on('board:drag-end', () => {
      if (!isOrganiser) return;
      socket.to('organisers').emit('presence:drag-end', { userId: user.id });
    });

    socket.on('disconnect', () => {
      // Only organisers were tracked in the presence map.
      if (presence.delete(socket.id)) broadcastPresence();
    });
  });

  return io;
}

module.exports = { initSocketServer, broadcastPresence };
