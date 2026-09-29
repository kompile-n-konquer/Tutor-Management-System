import { describe, test, expect, vi } from 'vitest';

const { MockGoogleAuthProvider } = vi.hoisted(() => ({
  MockGoogleAuthProvider: class MockGoogleAuthProvider {},
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: MockGoogleAuthProvider,
}));

import provider from './googleProvider.js';

describe('googleProvider — Google sign-in provider singleton', () => {
  test('exports a GoogleAuthProvider instance', () => {
    expect(provider).toBeInstanceOf(MockGoogleAuthProvider);
  });
});
