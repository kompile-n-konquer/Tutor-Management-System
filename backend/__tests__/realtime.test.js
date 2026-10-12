jest.mock('socket.io', () => ({ Server: jest.fn() }));
jest.mock('../firebase/admin', () => jest.fn());
jest.mock('../prisma/client', () => ({ user: { findUnique: jest.fn() } }));

const { Server } = require('socket.io');
const getFirebaseAdmin = require('../firebase/admin');
const prisma = require('../prisma/client');
const { initSocketServer } = require('../realtime/socketServer');
const realtimeIo = require('../realtime/io');

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

// A stand-in for the Socket.IO server: records which room received which
// event so assertions can target `user:{id}` / `organisers` directly.
function makeIoInstance() {
  const roomEmits = new Map();
  return {
    use: jest.fn(),
    on: jest.fn(),
    to: jest.fn((room) => {
      if (!roomEmits.has(room)) roomEmits.set(room, jest.fn());
      return { emit: roomEmits.get(room) };
    }),
    __roomEmits: roomEmits,
  };
}

function makeSocket(id, user) {
  return {
    id,
    data: { user },
    join: jest.fn(),
    on: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    handshake: { auth: { token: 'valid-token' } },
  };
}

describe('socketServer', () => {
  let ioInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    ioInstance = makeIoInstance();
    Server.mockImplementation(() => ioInstance);
    getFirebaseAdmin.mockReturnValue({
      getAuth: () => ({
        verifyIdToken: jest.fn().mockResolvedValue({ uid: 'uid-1' }),
      }),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      firstName: 'Riya',
      lastName: 'Naidoo',
      email: 'riya@example.com',
      role: 'tutor',
    });
    initSocketServer({});
  });

  const authMiddleware = () => ioInstance.use.mock.calls[0][0];
  const connectionHandler = () =>
    ioInstance.on.mock.calls.find(([event]) => event === 'connection')[1];

  const socketListener = (socket, event) =>
    socket.on.mock.calls.find(([registered]) => registered === event)[1];

  test('authenticates the handshake and attaches the user with a normalised role', async () => {
    const socket = { data: {}, handshake: { auth: { token: 'valid-token' } } };
    const next = jest.fn();

    await authMiddleware()(socket, next);
    await flushMicrotasks();

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { firebaseUid: 'uid-1' } });
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.user).toEqual({
      id: 7,
      name: 'Riya Naidoo',
      email: 'riya@example.com',
      role: 'TUTOR',
    });
  });

  test('rejects a handshake without a token', async () => {
    const socket = { data: {}, handshake: { auth: {} } };
    const next = jest.fn();

    await authMiddleware()(socket, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(new Error('Missing auth token'));
  });

  test('rejects a token that fails verification', async () => {
    getFirebaseAdmin.mockReturnValue({
      getAuth: () => ({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('bad token')),
      }),
    });
    const socket = { data: {}, handshake: { auth: { token: 'expired' } } };
    const next = jest.fn();

    await authMiddleware()(socket, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(new Error('Invalid Firebase ID token'));
  });

  test('rejects a token for a user that is not in the database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const socket = { data: {}, handshake: { auth: { token: 'valid-token' } } };
    const next = jest.fn();

    await authMiddleware()(socket, next);
    await flushMicrotasks();

    expect(next).toHaveBeenCalledWith(new Error('User not found'));
  });

  test('a tutor joins only their own room — no board room, no presence', () => {
    const socket = makeSocket('sock-tutor', {
      id: 7,
      name: 'Riya Naidoo',
      email: 'riya@example.com',
      role: 'TUTOR',
    });

    connectionHandler()(socket);

    expect(socket.join).toHaveBeenCalledWith('user:7');
    expect(socket.join).not.toHaveBeenCalledWith('organisers');
    // No presence broadcast ever targeted the tutor's socket.
    expect(ioInstance.__roomEmits.get('sock-tutor')).toBeUndefined();
  });

  test('an organiser joins their own room and the board room, and is announced', () => {
    const socket = makeSocket('sock-org', {
      id: 1,
      name: 'Ori Ganiser',
      email: 'ori@example.com',
      role: 'ORGANISER',
    });

    connectionHandler()(socket);

    expect(socket.join).toHaveBeenCalledWith('user:1');
    expect(socket.join).toHaveBeenCalledWith('organisers');
    // The presence list dedupes by user and never leaks the role field.
    expect(ioInstance.__roomEmits.get('sock-org')).toHaveBeenCalledWith('presence:list', {
      organisers: [{ id: 1, name: 'Ori Ganiser', email: 'ori@example.com' }],
      selfId: 1,
    });

    // The presence map is module state — leave it empty for the next test.
    socketListener(socket, 'disconnect')();
  });

  test('board drag events are organiser-only', () => {
    const tutorSocket = makeSocket('sock-tutor', {
      id: 7,
      name: 'Riya Naidoo',
      email: 'riya@example.com',
      role: 'TUTOR',
    });
    const organiserSocket = makeSocket('sock-org', {
      id: 1,
      name: 'Ori Ganiser',
      email: 'ori@example.com',
      role: 'ORGANISER',
    });

    connectionHandler()(tutorSocket);
    connectionHandler()(organiserSocket);

    socketListener(tutorSocket, 'board:drag')({
      applicantId: 3,
      applicantName: 'Someone',
      courseId: 2,
      pool: 'available',
    });
    expect(tutorSocket.to).not.toHaveBeenCalled();

    socketListener(organiserSocket, 'board:drag')({
      applicantId: 3,
      applicantName: 'Someone',
      courseId: 2,
      pool: 'available',
    });
    expect(organiserSocket.to).toHaveBeenCalledWith('organisers');
    expect(organiserSocket.to.mock.results[0].value.emit).toHaveBeenCalledWith('presence:drag', {
      userId: 1,
      name: 'Ori Ganiser',
      applicantId: 3,
      applicantName: 'Someone',
      courseId: 2,
      pool: 'available',
    });

    socketListener(tutorSocket, 'board:drag-end')();
    expect(tutorSocket.to).not.toHaveBeenCalledWith('organisers');
    socketListener(organiserSocket, 'board:drag-end')();
    expect(organiserSocket.to.mock.results[1].value.emit).toHaveBeenCalledWith(
      'presence:drag-end',
      { userId: 1 },
    );

    // Leave the module-level presence map empty for the next test.
    socketListener(organiserSocket, 'disconnect')();
    socketListener(tutorSocket, 'disconnect')();
  });

  test('an organiser leaving updates the presence list; a tutor leaving does not', () => {
    const organiserOne = makeSocket('sock-org-1', {
      id: 1,
      name: 'Ori Ganiser',
      email: 'ori@example.com',
      role: 'ORGANISER',
    });
    // An admin shares the board room exactly like an organiser.
    const organiserTwo = makeSocket('sock-org-2', {
      id: 2,
      name: 'Ada Organiser',
      email: 'ada@example.com',
      role: 'ADMIN',
    });
    const tutorSocket = makeSocket('sock-tutor', {
      id: 7,
      name: 'Riya Naidoo',
      email: 'riya@example.com',
      role: 'TUTOR',
    });

    connectionHandler()(organiserOne);
    connectionHandler()(organiserTwo);
    connectionHandler()(tutorSocket);

    const emitTwo = ioInstance.__roomEmits.get('sock-org-2');
    const callsBefore = emitTwo.mock.calls.length;

    socketListener(tutorSocket, 'disconnect')();
    // A tutor was never in the presence map, so nobody is re-notified.
    expect(emitTwo.mock.calls.length).toBe(callsBefore);

    socketListener(organiserOne, 'disconnect')();
    // The remaining organiser is told the board now holds only them.
    expect(emitTwo).toHaveBeenLastCalledWith('presence:list', {
      organisers: [{ id: 2, name: 'Ada Organiser', email: 'ada@example.com' }],
      selfId: 2,
    });

    // Leave the module-level presence map empty for the next test.
    socketListener(organiserTwo, 'disconnect')();
  });
});

describe('realtime/io', () => {
  let ioInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    ioInstance = makeIoInstance();
  });

  afterEach(() => {
    realtimeIo.setIo(null);
  });

  test('emitDashboardChange reaches each affected user room exactly once', () => {
    realtimeIo.setIo(ioInstance);

    realtimeIo.emitDashboardChange([7, 7, null, 8], 'cover-offered');

    expect(ioInstance.__roomEmits.get('user:7')).toHaveBeenCalledTimes(1);
    expect(ioInstance.__roomEmits.get('user:7')).toHaveBeenCalledWith(
      'dashboard:changed',
      expect.objectContaining({ reason: 'cover-offered' }),
    );
    expect(ioInstance.__roomEmits.get('user:8')).toHaveBeenCalledTimes(1);
    expect(ioInstance.__roomEmits.get('user:9')).toBeUndefined();
  });

  test('emitDashboardChange can additionally reach every organiser', () => {
    realtimeIo.setIo(ioInstance);

    realtimeIo.emitDashboardChange([7], 'timesheet-submitted', { includeOrganisers: true });

    expect(ioInstance.__roomEmits.get('user:7')).toHaveBeenCalledWith(
      'dashboard:changed',
      expect.objectContaining({ reason: 'timesheet-submitted' }),
    );
    expect(ioInstance.__roomEmits.get('organisers')).toHaveBeenCalledWith(
      'dashboard:changed',
      expect.objectContaining({ reason: 'timesheet-submitted' }),
    );
  });

  test('emitDashboardChange accepts a single user id and is safe before init', () => {
    // No setIo: the emit must be a no-op, not a crash.
    expect(() => realtimeIo.emitDashboardChange(7, 'cover-offered')).not.toThrow();

    realtimeIo.setIo(ioInstance);
    realtimeIo.emitDashboardChange(7, 'cover-offered');
    expect(ioInstance.__roomEmits.get('user:7')).toHaveBeenCalledWith(
      'dashboard:changed',
      expect.objectContaining({ reason: 'cover-offered' }),
    );
  });

  test('emitToOrganisers keeps its null guard', () => {
    expect(() => realtimeIo.emitToOrganisers('allocation:changed', {})).not.toThrow();

    realtimeIo.setIo(ioInstance);
    realtimeIo.emitToOrganisers('allocation:changed', { type: 'assign' });
    expect(ioInstance.__roomEmits.get('organisers')).toHaveBeenCalledWith('allocation:changed', {
      type: 'assign',
    });
  });
});
