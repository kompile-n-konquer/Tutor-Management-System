// Route-wiring smoke tests: they fail if a route is accidentally removed,
// renamed, or loses its authenticateFirebaseToken middleware.
jest.mock('../prisma/client', () => ({}));
jest.mock('../firebase/admin', () => jest.fn());

const sessionsRouter = require('../routes/sessions');
const authRouter = require('../routes/auth');
const availabilityRouter = require('../routes/availability');

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
  test('sessions routes expose the excuse/volunteer endpoints behind auth', () => {
    expect(routeTable(sessionsRouter)).toEqual([
      { path: '/unassigned', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/mine', methods: ['get'], handlers: 2 },
      { path: '/:id/excuse', methods: ['patch'], handlers: 2 },
      { path: '/:id/volunteer', methods: ['post'], handlers: 2 },
    ]);
  });

  test('user routes keep listing/creation public and deletion behind auth', () => {
    expect(routeTable(authRouter)).toEqual([
      { path: '/', methods: ['get'], handlers: 1 }, // public listing
      { path: '/', methods: ['post'], handlers: 1 }, // public signup
      { path: '/me', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/verify-role', methods: ['get'], handlers: 2 }, // auth + controller
      { path: '/', methods: ['delete'], handlers: 2 }, // auth + controller
    ]);
  });

  test('availability routes are fully behind auth', () => {
    expect(routeTable(availabilityRouter)).toEqual([
      { path: '/', methods: ['get'], handlers: 2 },
      { path: '/', methods: ['put'], handlers: 2 },
    ]);
  });
});
