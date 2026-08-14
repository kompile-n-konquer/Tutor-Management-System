const { isValidEmail, factorial } = require('../validators');

describe('isValidEmail', () => {
  test('returns true for a standard valid email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  test('returns true for emails with subdomains', () => {
    expect(isValidEmail('admin@mail.example.co.uk')).toBe(true);
  });

  test('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  test('returns false for a string without @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  test('returns false for a string without a domain extension', () => {
    expect(isValidEmail('user@example')).toBe(false);
  });

  test('returns false for a string with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  test('returns false for non-string inputs', () => {
    expect(isValidEmail(12345)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });

  test('trims whitespace before validating', () => {
    expect(isValidEmail('  user@example.com  ')).toBe(true);
  });
});

describe('factorial', () => {
  test('returns 1 for 0', () => {
    expect(factorial(0)).toBe(1);
  });

  test('returns 1 for 1', () => {
    expect(factorial(1)).toBe(1);
  });

  test('returns correct factorial for 5', () => {
    expect(factorial(5)).toBe(120);
  });

  test('returns correct factorial for 10', () => {
    expect(factorial(10)).toBe(3628800);
  });

  test('throws an error for negative numbers', () => {
    expect(() => factorial(-1)).toThrow('Input must be a non-negative integer');
  });

  test('throws an error for non-integer inputs', () => {
    expect(() => factorial(3.5)).toThrow('Input must be a non-negative integer');
  });

  test('throws an error for NaN', () => {
    expect(() => factorial(NaN)).toThrow('Input must be a non-negative integer');
  });
});
