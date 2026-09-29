// Holds the Socket.IO server instance so controllers can broadcast board
// updates without depending on how the HTTP server was created.

let io = null;

function setIo(instance) {
  io = instance;
}

function emitToOrganisers(event, payload) {
  if (io) io.to('organisers').emit(event, payload);
}

module.exports = { setIo, emitToOrganisers };
