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

export function shouldRetryEmailStatus(status) {
  const code = Number(status);
  if (!Number.isFinite(code)) return true;
  if (code === 429) return true;
  if (code >= 500) return true;
  return false;
}

function wait(ms, sleep) {
  if (!ms) return Promise.resolve();
  return sleep(ms);
}

export async function sendEmailNotification({
  to,
  subject,
  text,
  html,
  from,
  fetchImpl = fetch,
  attempts = 3,
  delaysMs = [400, 1200],
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const recipient = String(to || "").trim();
  if (!recipient) return { ok: false, skipped: true, reason: "missing_recipient" };

  const apiKey = String(process.env.RESEND_API_KEY || process.env.NOTIFY_RESEND_API_KEY || "").trim();
  const sender = String(from || process.env.NOTIFY_FROM_EMAIL || process.env.ABUSE_NOTIFY_FROM || "MemeWarzone <noreply@memewar.zone>").trim();

  if (!apiKey) {
    console.info("[notify] email skipped (no RESEND_API_KEY)", { to: recipient, subject });
    return { ok: true, skipped: true, reason: "provider_unconfigured" };
  }

  const maxAttempts = Math.max(1, Number(attempts) || 1);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let retryable = true;
    try {
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

      if (response.ok) return { ok: true, skipped: false, attempts: attempt };

      const body = await response.text().catch(() => "");
      lastError = new Error(`Email provider failed (${response.status}): ${body.slice(0, 200)}`);
      retryable = shouldRetryEmailStatus(response.status);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryable = true;
    }

    if (!retryable || attempt === maxAttempts) throw lastError;
    await wait(delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0, sleep);
  }

  throw lastError || new Error("Email provider failed");
}
