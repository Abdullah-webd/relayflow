import { env } from "../env";

/**
 * Send a plain-text email through Resend. Best-effort at the call site: callers that
 * must not fail (signup, reset) should catch and log, and surface the OTP/link in the
 * server log in development so testing can proceed if email is momentarily down.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!env.resendApiKey) {
    console.warn(`[mailer] RESEND_API_KEY not set — would send "${subject}" to ${to}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.resendFrom, to: [to], subject, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error ${response.status}: ${body.slice(0, 200)}`);
  }
}
