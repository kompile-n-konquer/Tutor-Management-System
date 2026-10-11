// Brevo email delivery via the v3 HTTP API (https://developers.brevo.com).
// Implemented with the global fetch — no SDK dependency. Keeps the defensive
// pattern of the module it replaces: a missing API key or a failed request
// must never crash the app — sendEmail resolves with { data, error } instead
// of throwing, and the notifier records the failure in EmailLog.

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

// Display name shown in every notification email. The address comes from
// BREVO_SENDER_EMAIL and must be a verified sender in the Brevo account.
const SENDER_NAME = 'TutorFlow';

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY);
}

// Accept a single address ("user@example.com") or an array of them and shape
// them into the [{ email }] objects the Brevo API expects.
function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list.filter(Boolean).map((entry) => ({
    email: typeof entry === 'string' ? entry : entry.email,
  }));
}

// Crude HTML -> plain-text conversion, used only when a caller supplies HTML
// without a text alternative. The notifier always passes both.
function htmlToText(html) {
  return String(html ?? '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// Shape a failure the way callers already consume it: data stays null and the
// error carries the status (when there is one) so the notifier can log it.
function fail(message, statusCode = null, responseBody = null) {
  return { data: null, error: { statusCode, message, body: responseBody } };
}

/**
 * Send one email through the Brevo HTTP API: POST /v3/smtp/email.
 *
 * `to` accepts a single address or an array of addresses. When no plain-text
 * body is passed, one is generated from the HTML content. Resolves with
 * { data, error }: `data` holds the API response ({ messageId }) on success,
 * `error` describes the failure otherwise — this function never throws for
 * expected failures, so a Brevo outage can never crash the calling flow.
 */
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey) {
    return fail('BREVO_API_KEY is not set; cannot send notification emails');
  }
  if (!senderEmail) {
    return fail('BREVO_SENDER_EMAIL is not set; cannot send notification emails');
  }

  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    return fail('No recipient email address provided; cannot send notification email');
  }

  const payload = {
    sender: { name: SENDER_NAME, email: senderEmail },
    to: recipients,
    subject,
    htmlContent: html,
    textContent: text ?? htmlToText(html),
  };

  let response;
  try {
    response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (networkError) {
    return fail(`Brevo request failed: ${networkError.message}`);
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '');
    // Requirement: failures must be visible in the logs — status + body.
    console.error(
      `[email] Brevo API returned ${response.status} for "${subject}":`,
      responseBody,
    );
    return fail(`Brevo API error ${response.status}`, response.status, responseBody);
  }

  const data = await response.json().catch(() => null);
  return { data, error: null };
}

module.exports = { sendEmail, isBrevoConfigured };
