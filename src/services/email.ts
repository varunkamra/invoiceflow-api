import { env } from "../config/env.js";

/**
 * Email sender via Resend's plain HTTP API (no SDK needed).
 *
 * In development without a RESEND_API_KEY, emails are logged instead of sent —
 * keeps the flow testable without real credentials.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; content: Buffer };
}): Promise<{ sent: boolean; id?: string }> {
  if (!env.RESEND_API_KEY || env.RESEND_API_KEY === "re_xxx") {
    console.log(`[email:dev] to=${opts.to} subject="${opts.subject}" attachment=${opts.attachment ? opts.attachment.filename : "none"}`);
    return { sent: false };
  }

  const body: Record<string, unknown> = {
    from: env.EMAIL_FROM ?? "invoices@resend.dev",
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  };
  if (opts.attachment) {
    body.attachments = [
      {
        filename: opts.attachment.filename,
        content: opts.attachment.content.toString("base64"),
      },
    ];
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`resend API failed: ${res.status} ${text}`), { statusCode: 502 });
  }
  const data = (await res.json()) as { id: string };
  return { sent: true, id: data.id };
}
