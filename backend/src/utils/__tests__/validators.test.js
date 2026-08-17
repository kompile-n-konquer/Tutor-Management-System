const { isValidEmail } = require('../validators');

describe('isValidEmail — Tutor Management System email validation', () => {
  describe('accepts valid email formats', () => {
    test.each([
      ['standard email', 'student@wits.ac.za'],
      ['simple domain', 'tutor@example.com'],
      ['dots in local part', 'john.doe@university.edu'],
      ['hyphenated domain', 'user@my-school.org'],
      ['plus addressing', 'admin+tag@gmail.com'],
      ['underscore in local', 'first_last@domain.co.za'],
      ['numeric local part', 'student2024@wits.ac.za'],
      ['long TLD', 'user@company.technology'],
      ['subdomain email', 'lecturer@dept.wits.ac.za'],
      ['single-char local', 'a@b.co'],
      ['percent in local', 'user%tag@domain.com'],
    ])('%s — %s', (_label, email) => {
      expect(isValidEmail(email)).toBe(true);
    });
  });

  describe('trims whitespace before validation', () => {
    test('leading whitespace', () => {
      expect(isValidEmail('   user@wits.ac.za')).toBe(true);
    });

    test('trailing whitespace', () => {
      expect(isValidEmail('user@wits.ac.za   ')).toBe(true);
    });

    test('both leading and trailing whitespace', () => {
      expect(isValidEmail('  tutor@example.com  ')).toBe(true);
    });
  });

  describe('rejects structurally invalid emails', () => {
    test.each([
      ['missing @', 'userexample.com'],
      ['missing domain', 'user@'],
      ['missing local part', '@example.com'],
      ['missing TLD', 'user@example'],
      ['double @', 'user@@example.com'],
      ['space in local part', 'user name@example.com'],
      ['space in domain', 'user@exam ple.com'],
      ['empty string', ''],
      ['only @', '@'],
      ['only dots', '...'],
      ['no dot in domain', 'user@localhost'],
    ])('%s — "%s"', (_label, email) => {
      expect(isValidEmail(email)).toBe(false);
    });
  });

  describe('rejects non-string inputs', () => {
    test.each([
      ['null', null],
      ['undefined', undefined],
      ['number', 12345],
      ['boolean', true],
      ['object', { email: 'user@test.com' }],
      ['array', ['user@test.com']],
      ['NaN', NaN],
    ])('%s', (_label, input) => {
      expect(isValidEmail(input)).toBe(false);
    });
  });

  describe('edge cases relevant to TutorFlow signup/login', () => {
    test('rejects email with only spaces', () => {
      expect(isValidEmail('   ')).toBe(false);
    });

    test('rejects email with tab characters', () => {
      expect(isValidEmail('user\t@example.com')).toBe(false);
    });

    test('rejects email with newline characters', () => {
      expect(isValidEmail('user\n@example.com')).toBe(false);
    });

    test('accepts typical university email formats', () => {
      expect(isValidEmail('kg.newuser@wits.ac.za')).toBe(true);
      expect(isValidEmail('student123@students.wits.ac.za')).toBe(true);
    });

    test('accepts Firebase-style email used during signup', () => {
      expect(isValidEmail('tutor.flow+test@gmail.com')).toBe(true);
    });
  });
});
