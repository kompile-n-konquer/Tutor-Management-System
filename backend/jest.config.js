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
  verbose: true,
};
