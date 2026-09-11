const { Resend } = require('resend');

// Initialize the Resend client (https://resend.com) lazily, mirroring the defensive
// pattern in firebase/admin.js: a missing API key must never crash the app at
// startup — the notifier catches the error and logs the attempt as FAILED instead.
let resendClient = null;

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Resend is not configured. Set RESEND_API_KEY in the environment to send notification emails.',
    );
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

// Sender address shown in notification emails. EMAIL_FROM can be any format
// Resend accepts, e.g. "Tutor Management System <noreply@yourdomain.com>".
// The fallback is Resend's shared test sender, which can only deliver to the
// email address that owns the Resend account — set EMAIL_FROM to a
// domain-verified address for real recipients.
function getFromAddress() {
  return process.env.EMAIL_FROM || 'Tutor Management System <onboarding@resend.dev>';
}

module.exports = { getResendClient, isResendConfigured, getFromAddress };
