import { describe, test, expect } from 'vitest';
import isValidEmail from './validEmail.js';

describe('isValidEmail — frontend email validation (used by Login, Signup, ForgotPassword)', () => {
  describe('accepts valid email formats used in TutorFlow', () => {
    test.each([
      ['standard Wits university email', 'kg.newuser@wits.ac.za'],
      ['student email with numbers', 'student2024@students.wits.ac.za'],
      ['simple email', 'tutor@example.com'],
      ['dots in local part', 'john.doe@university.edu'],
      ['hyphenated domain', 'user@my-school.org'],
      ['plus addressing', 'admin+tag@gmail.com'],
      ['underscore in local', 'first_last@domain.co.za'],
      ['single-char local', 'a@b.co'],
    ])('%s — %s', (_label, email) => {
      expect(isValidEmail(email)).toBe(true);
    });
  });

  describe('rejects invalid email formats that would fail Firebase auth', () => {
    test.each([
      ['missing @', 'userexample.com'],
      ['missing domain', 'user@'],
      ['missing local part', '@example.com'],
      ['missing TLD', 'user@example'],
      ['double @', 'user@@example.com'],
      ['empty string', ''],
      ['space in local', 'user name@example.com'],
    ])('%s — "%s"', (_label, email) => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  describe('form integration — button disable logic depends on this function', () => {
    test('returns false for empty string — disables submit button on empty field', () => {
      // Login.jsx: if (!email || !isValidEmail(email)) disableBtn = true
      expect(isValidEmail('')).toBe(false);
    });

    test('returns false for incomplete email during typing — keeps button disabled', () => {
      expect(isValidEmail('user')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@wits')).toBe(false);
    });

    test('returns true only when email is fully formed — enables submit button', () => {
      expect(isValidEmail('user@wits.ac.za')).toBe(true);
    });

    it("trims whitespace before validation", () => {
      // Fixed: frontend now trims before validation, matching backend behavior.
      // This means typing " user@test.com " in the input field WILL validate correctly.
      expect(isValidEmail(' user@wits.ac.za')).toBe(true);
      expect(isValidEmail('user@wits.ac.za ')).toBe(true);
    });
    test('handles Signup form: password field is irrelevant to email validation', () => {
      // Signup.jsx checks all fields independently; isValidEmail only checks the email field
      expect(isValidEmail('valid@email.com')).toBe(true);
    });
  });
});
