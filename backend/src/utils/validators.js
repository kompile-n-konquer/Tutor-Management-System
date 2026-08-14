/**
 * Validates that a given string is a properly formatted email address.
 * @param {string} email - The email string to validate.
 * @returns {boolean} True if the email is valid, false otherwise.
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Calculates the factorial of a non-negative integer.
 * @param {number} n - A non-negative integer.
 * @returns {number} The factorial of n.
 * @throws {Error} If n is not a non-negative integer.
 */
function factorial(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Input must be a non-negative integer');
  }
  if (n === 0 || n === 1) return 1;

  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

module.exports = { isValidEmail, factorial };
