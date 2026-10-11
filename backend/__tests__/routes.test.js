// Route-wiring smoke tests: they fail if a route is accidentally removed,
// renamed, or loses its authenticateFirebaseToken middleware.
jest.mock('../prisma/client', () => ({}));
jest.mock('../firebase/admin', () => jest.fn());

const sessionsRouter = require('../routes/sessions');
const authRouter = require('../routes/auth');
const availabilityRouter = require('../routes/availability');
const timesheetsRouter = require('../routes/timesheets');

// Flattens an express Router into [{ path, methods, handlers }] entries.
const routeTable = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
      handlers: layer.route.stack.length,
    }));

describe('routes wiring', () => {
  test('sessions routes expose the excuse/volunteer/cover endpoints behind auth', () => {
    expect(routeTable(sessionsRouter)).toEqual([
      { path: '/unassigned', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/mine', methods: ['get'], handlers: 2 },
      { path: '/volunteered', methods: ['get'], handlers: 2 },
      { path: '/lecturer', methods: ['get'], handlers: 3 }, // auth + lecturer gate + controller
      { path: '/:id/excuse', methods: ['patch'], handlers: 2 },
      { path: '/:id/volunteer', methods: ['post'], handlers: 2 },
      { path: '/:id/volunteer', methods: ['patch'], handlers: 3 }, // auth + lecturer gate + controller
      { path: '/:id/cover-candidates', methods: ['get'], handlers: 2 },
      { path: '/:id/cover-offer', methods: ['post'], handlers: 2 },
      { path: '/:id/cover-offer', methods: ['patch'], handlers: 2 },
      { path: '/:id/cover-offer', methods: ['delete'], handlers: 2 },
    ]);
  });

  test('auth routes wire the right middleware per endpoint', () => {
    expect(routeTable(authRouter)).toEqual([
      { path: '/', methods: ['get'], handlers: 3 }, // auth + organiser/admin gate + controller
      { path: '/me', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/verify-role', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/:firebaseUid', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/', methods: ['post'], handlers: 2 }, // token-only verification + signup controller
      { path: '/', methods: ['put'], handlers: 2 }, // auth + controller
      { path: '/', methods: ['delete'], handlers: 2 }, // auth + controller
    ]);
  });

  test('availability routes are fully behind auth', () => {
    expect(routeTable(availabilityRouter)).toEqual([
      { path: '/', methods: ['get'], handlers: 2 },
      { path: '/', methods: ['put'], handlers: 2 },
      { path: '/timetable-pdf', methods: ['get'], handlers: 2 },
      { path: '/timetable-pdf', methods: ['put'], handlers: 4 }, // auth + multer + upload-error conversion + controller
      { path: '/timetable-pdf/download', methods: ['get'], handlers: 2 },
      { path: '/timetable-pdf', methods: ['delete'], handlers: 2 },
    ]);
  });

  test('timesheet routes expose the full workflow behind auth', () => {
    expect(routeTable(timesheetsRouter)).toEqual([
      // Literal paths must be registered before /:id so they are not shadowed.
      { path: '/', methods: ['get'], handlers: 2 },
      { path: '/pending-review', methods: ['get'], handlers: 2 },
      { path: '/supervisors', methods: ['get'], handlers: 2 },
      { path: '/', methods: ['post'], handlers: 2 },
      { path: '/:id', methods: ['get'], handlers: 2 },
      { path: '/:id', methods: ['put'], handlers: 2 },
      { path: '/:id', methods: ['delete'], handlers: 2 },
      { path: '/:id/submit', methods: ['post'], handlers: 2 },
      { path: '/:id/entries/:entryId/approve', methods: ['put'], handlers: 2 },
      { path: '/:id/reject', methods: ['put'], handlers: 2 },
      { path: '/:id/export', methods: ['get'], handlers: 2 },
    ]);
  });
});
