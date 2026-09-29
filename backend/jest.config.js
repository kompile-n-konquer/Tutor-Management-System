/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/controllers', '<rootDir>/utils', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  // Coverage scope: all logic modules (controllers, middleware, routes, utils).
  // index.js (server bootstrap) is intentionally excluded — it only wires the app.
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    'utils/**/*.js',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  // Coverage gates run in CI via `npm run test:coverage`.
  //
  // Files listed below are covered end-to-end by this suite and gated at 90%
  // individually, so a regression in a tested feature fails CI immediately.
  //
  // The `global` floors are a ratchet over every remaining module. Jest
  // checks the global bucket by excluding files that have their own gate
  // above. Modules that still have no tests (applications/events/settings/
  // timesheets controllers, systemSettings, availabilityLocks) keep the
  // aggregate low — raise these floors as those modules gain tests,
  // never lower them.
  coverageThreshold: {
    global: {
      statements: 27,
      branches: 20,
      functions: 34,
      lines: 27,
    },
    './controllers/availability.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './controllers/error.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './controllers/sessions.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './middleware/auth.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './routes/auth.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './routes/availability.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './routes/sessions.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './utils/catchAsync.js': { statements: 90, branches: 90, functions: 90, lines: 90 },
    './utils/claimRules.js': { statements: 90, branches: 85, functions: 90, lines: 90 },
  },
  verbose: true,
};
