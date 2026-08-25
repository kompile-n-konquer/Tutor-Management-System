/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/controllers', '<rootDir>/utils', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: ['controllers/**/*.js', 'utils/**/*.js', '!src/**/__tests__/**', '!**/__tests__/**'],
  coverageDirectory: 'coverage',
  verbose: true,
};
