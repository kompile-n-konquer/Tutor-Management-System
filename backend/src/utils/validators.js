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

module.exports = { isValidEmail };
