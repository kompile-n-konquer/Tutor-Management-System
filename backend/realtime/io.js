// Holds the Socket.IO server instance so controllers can broadcast updates
// without depending on how the HTTP server was created.

let io = null;

function setIo(instance) {
  io = instance;
}

function emitToOrganisers(event, payload) {
  if (io) io.to('organisers').emit(event, payload);
}

// Dashboard refresh signal. Every authenticated socket joins its own
// `user:{id}` room (see socketServer.js), so a mutation can tell exactly the
// people it affected — the tutor whose timesheet was rejected, the lecturer
// whose course got a cover offer — to refetch their dashboard. Organisers
// monitor aggregate queues, so queue-depth changes additionally pass
// includeOrganisers to reach the board room.
function emitDashboardChange(userIds, reason, { includeOrganisers = false } = {}) {
  if (!io) return;
  const payload = { reason, at: new Date().toISOString() };
  const ids = [
    ...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter((id) => id != null)),
  ];
  for (const userId of ids) {
    io.to(`user:${userId}`).emit('dashboard:changed', payload);
  }
  if (includeOrganisers) io.to('organisers').emit('dashboard:changed', payload);
}

module.exports = { setIo, emitToOrganisers, emitDashboardChange };
