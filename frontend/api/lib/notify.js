/**
 * Generic outbound notification worker.
 * Abuse (and later other modules) call this instead of a vendor SDK.
 */

export function siteOrigin() {
  const raw = String(
    process.env.PUBLIC_APP_ORIGIN
    || process.env.VITE_PUBLIC_SITE_URL
    || process.env.VITE_SITE_URL
    || "https://memewar.zone",
  ).trim().replace(/\/+$/, "");
  return raw || "https://memewar.zone";
}

export async function sendEmailNotification({
  to,
  subject,
  text,
  html,
  from,
  fetchImpl = fetch,
} = {}) {
  const recipient = String(to || "").trim();
  if (!recipient) return { ok: false, skipped: true, reason: "missing_recipient" };

  const apiKey = String(process.env.RESEND_API_KEY || process.env.NOTIFY_RESEND_API_KEY || "").trim();
  const sender = String(from || process.env.NOTIFY_FROM_EMAIL || process.env.ABUSE_NOTIFY_FROM || "MemeWarzone <noreply@memewar.zone>").trim();

  if (!apiKey) {
    console.info("[notify] email skipped (no RESEND_API_KEY)", { to: recipient, subject });
    return { ok: true, skipped: true, reason: "provider_unconfigured" };
  }

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: sender,
      to: [recipient],
      subject,
      text,
      html: html || `<p>${String(text || "").replace(/\n/g, "<br/>")}</p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Email provider failed (${response.status}): ${body.slice(0, 200)}`);
  }

  return { ok: true, skipped: false };
}
