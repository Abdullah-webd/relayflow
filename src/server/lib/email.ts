import { env } from "../env";

/**
 * Send a plain-text email through Resend. Best-effort at the call site: callers that
 * must not fail (signup, reset) should catch and log, and surface the OTP/link in the
 * server log in development so testing can proceed if email is momentarily down.
 */
export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!env.resendApiKey) {
    console.warn(`[mailer] RESEND_API_KEY not set — would send "${subject}" to ${to}`);
    return;
  }
  const payload: Record<string, unknown> = {
    from: env.resendFrom,
    to: [to],
    subject,
    text,
    // Sending both a text and an HTML part (a proper multipart email) improves
    // deliverability — plain-text-only mail is more likely to be flagged as spam.
    ...(html ? { html } : {}),
    reply_to: env.resendReplyTo || undefined,
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error ${response.status}: ${body.slice(0, 200)}`);
  }
}

/** A clean, branded HTML wrapper for transactional emails (helps inbox placement). */
export function brandedEmail(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f7f8fb;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2939">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e7eaf0;border-radius:16px;overflow:hidden">
      <tr><td style="padding:24px 28px 8px">
        <div style="font-weight:800;font-size:18px;color:#101828">RelayFlow</div>
        <div style="font-size:12px;color:#98a2b3;margin-top:2px">by Levi app</div>
      </td></tr>
      <tr><td style="padding:8px 28px 28px">
        <h1 style="font-size:20px;color:#101828;margin:12px 0 8px">${heading}</h1>
        <div style="font-size:15px;line-height:1.6;color:#475467">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:16px 28px;border-top:1px solid #e7eaf0;font-size:12px;color:#98a2b3">
        You received this because someone used this email to access RelayFlow. If that wasn't you, you can ignore it.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
