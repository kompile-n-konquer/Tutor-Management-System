import { describe, test, expect } from 'vitest';
import firebaseErrorMessages from './getFirebaseErrorMessage.js';

describe('getFirebaseErrorMessage — Firebase error code to user message mapping', () => {
  describe('sign-up error codes', () => {
    test('auth/email-already-in-use returns duplicate account message', () => {
      expect(firebaseErrorMessages['auth/email-already-in-use']).toBe(
        'An account with this email already exists.',
      );
    });

    test('auth/invalid-email returns valid email prompt', () => {
      expect(firebaseErrorMessages['auth/invalid-email']).toBe(
        'Please enter a valid email address.',
      );
    });

    test('auth/weak-password returns password strength message', () => {
      expect(firebaseErrorMessages['auth/weak-password']).toContain('stronger password');
    });
  });

  describe('sign-in error codes', () => {
    test('auth/invalid-credential returns incorrect credentials message', () => {
      expect(firebaseErrorMessages['auth/invalid-credential']).toBe(
        'The email or password you entered is incorrect.',
      );
    });

    test('auth/user-not-found returns no account message', () => {
      expect(firebaseErrorMessages['auth/user-not-found']).toContain('No account');
    });

    test('auth/wrong-password returns incorrect credentials message', () => {
      expect(firebaseErrorMessages['auth/wrong-password']).toBe(
        'The email or password you entered is incorrect.',
      );
    });

    test('auth/user-disabled returns disabled account message', () => {
      expect(firebaseErrorMessages['auth/user-disabled']).toContain('disabled');
    });
  });

  describe('general authentication error codes', () => {
    test('auth/too-many-requests returns rate limiting message', () => {
      expect(firebaseErrorMessages['auth/too-many-requests']).toContain('Too many attempts');
    });

    test('auth/operation-not-allowed returns unavailable message', () => {
      expect(firebaseErrorMessages['auth/operation-not-allowed']).toContain('unavailable');
    });

    test('auth/network-request-failed returns network error message', () => {
      expect(firebaseErrorMessages['auth/network-request-failed']).toContain('network error');
    });

    test('auth/internal-error returns generic failure message', () => {
      expect(firebaseErrorMessages['auth/internal-error']).toContain('Something went wrong');
    });

    test('auth/invalid-api-key returns configuration problem message', () => {
      expect(firebaseErrorMessages['auth/invalid-api-key']).toContain('configuration');
    });
  });

  describe('password reset / account management error codes', () => {
    test('auth/requires-recent-login returns re-authentication prompt', () => {
      expect(firebaseErrorMessages['auth/requires-recent-login']).toContain('sign in again');
    });

    test('auth/credential-already-in-use returns already associated message', () => {
      expect(firebaseErrorMessages['auth/credential-already-in-use']).toContain(
        'already associated',
      );
    });

    test('auth/account-exists-with-different-credential returns different method message', () => {
      expect(
        firebaseErrorMessages['auth/account-exists-with-different-credential'],
      ).toContain('different sign-in method');
    });

    test('auth/expired-action-code returns expired link message', () => {
      expect(firebaseErrorMessages['auth/expired-action-code']).toContain('expired');
    });

    test('auth/invalid-action-code returns invalid link message', () => {
      expect(firebaseErrorMessages['auth/invalid-action-code']).toContain('invalid');
    });
  });

  describe('unknown error codes', () => {
    test('returns undefined for unmapped error codes', () => {
      expect(firebaseErrorMessages['auth/some-future-error']).toBeUndefined();
    });

    test('returns undefined for completely unknown codes', () => {
      expect(firebaseErrorMessages['unknown/error']).toBeUndefined();
    });
  });

  describe('all mapped messages are user-friendly', () => {
    test('every message is a non-empty string', () => {
      const codes = Object.keys(firebaseErrorMessages);
      expect(codes.length).toBeGreaterThan(0);

      codes.forEach((code) => {
        expect(typeof firebaseErrorMessages[code]).toBe('string');
        expect(firebaseErrorMessages[code].length).toBeGreaterThan(0);
      });
    });

    test('no message exposes internal error codes or stack traces', () => {
      const codes = Object.keys(firebaseErrorMessages);
      codes.forEach((code) => {
        const message = firebaseErrorMessages[code];
        // Messages should not leak raw error codes
        expect(message).not.toMatch(/^auth\//);
        expect(message).not.toContain('Error:');
        expect(message).not.toContain('stack');
      });
    });
  });
});
