import { json, badMethod, readJson } from "../server/http.js";

/**
 * Dedicated newsletter signup for the public landing page.
 * Sends a clean "thank you for subscribing to the newsletter/dispatch" email.
 * Separate from the recruiter approval flow (which sends the heavy portal access email).
 *
 * Collection happens via:
 * - Welcome email to the subscriber (proof + "you're in")
 * - Internal notification to the FROM address (so team sees new signups in inbox)
 *
 * Env vars (set on Railway):
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL (or EMAIL_FROM)  -- set this to "MemeWarzone Newsletter <dispatches@updates.memewar.zone>" for best results
 */

const RESEND_API_URL = "https://api.resend.com/emails";

function getResendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY || process.env.EMAIL_RESEND_KEY || "",
    from: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "MemeWarzone Newsletter <dispatches@updates.memewar.zone>",
    replyTo: process.env.RESEND_REPLY_TO || process.env.EMAIL_REPLY_TO || "",
  };
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

async function sendResendEmail({ apiKey, from, to, subject, html, text, replyTo, headers }) {
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  if (!from) throw new Error("RESEND_FROM_EMAIL / EMAIL_FROM is not configured");

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };
  if (replyTo) payload.reply_to = Array.isArray(replyTo) ? replyTo : [replyTo];
  if (headers) payload.headers = headers;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `Resend error ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

function buildNewsletterThankYou(email) {
  const safeEmail = String(email).trim();
  const unsubscribeUrl = `https://memewar.zone/unsubscribe?email=${encodeURIComponent(safeEmail)}`;

  const subject = "Welcome to the MemeWarzone Dispatch";

  const text = [
    "You're in.",
    "",
    "Thanks for subscribing to the MemeWarzone Dispatch.",
    "You'll receive high-signal updates: campaign heat, league drops, recruiter intel, launch alerts, and battle reports.",
    "",
    "No spam. Only the war that matters.",
    "",
    "Unsubscribe: " + unsubscribeUrl,
    "",
    "If this wasn't you, you can ignore this transmission.",
    "",
    "MemeWarzone",
  ].join("\n");

  const html = `
    <div style="background:#030403;padding:32px 20px;font-family:Inter,system-ui,Arial,sans-serif;color:#f7efe3;">
      <div style="max-width:560px;margin:0 auto;background:#0a0c0a;border:1px solid rgba(255,153,0,0.25);border-radius:8px;overflow:hidden;">
        
        <!-- Logo -->
        <div style="padding: 20px 24px 0; text-align: center;">
          <img src="https://memewar.zone/assets/navbar-logo.png" alt="MemeWarzone" width="140" style="display: block; margin: 0 auto 16px; max-width: 140px; height: auto;" />
        </div>

        <div style="padding:0 24px 8px;border-bottom:1px solid rgba(255,153,0,0.15); text-align: center;">
          <div style="font-family:monospace;font-size:11px;letter-spacing:1px;color:#ff9900;opacity:0.9;">MWZ / DISPATCH</div>
          <h1 style="margin:8px 0 4px;font-size:22px;line-height:1.1;color:#fff6de;font-weight:800;text-transform:uppercase;">You're in the war room.</h1>
          <p style="margin:0;color:#b9ad9d;font-size:15px;line-height:1.5;">Thanks for subscribing. High-signal transmissions only.</p>
        </div>

        <div style="padding:22px 24px 26px;font-size:14px;line-height:1.65;color:#e8d0ad;">
          <p style="margin:0 0 14px;">Expect battle reports, league updates, recruiter signals, and launch intel straight from the front lines.</p>
          <p style="margin:0;color:#b9ad9d;font-size:13px;">No spam. Unsubscribe anytime via the footer of any dispatch.</p>
        </div>

        <!-- Unsubscribe area -->
        <div style="padding: 0 24px 20px; text-align: center; border-top: 1px solid rgba(255,153,0,0.15); margin-top: 8px;">
          <a href="${unsubscribeUrl}" 
             style="display: inline-block; background: rgba(255,153,0,0.1); color: #ff9900; padding: 8px 20px; border-radius: 4px; text-decoration: none; font-size: 12px; border: 1px solid rgba(255,153,0,0.3); font-family: monospace; letter-spacing: 0.5px;">
            UNSUBSCRIBE FROM MEMEWARZONE NEWSLETTER
          </a>
          <div style="margin-top: 12px; font-size: 10px; color: #766d62;">
            MemeWarzone • If this wasn't you, ignore this message.
          </div>
        </div>

      </div>
    </div>
  `;

  return { subject, text, html, unsubscribeUrl };
}

function buildAdvertiseThankYou(email) {
  const safeEmail = String(email).trim();
  const subject = "You're on the MemeWarzone ad waitlist";
  const text = [
    "You're on the list.",
    "",
    "Thanks for asking about advertising on MemeWarzone.",
    "Search and featured slots are paid placements. We will email you when you can book a spot.",
    "",
    "MemeWarzone",
  ].join("\n");
  const html = `
    <div style="background:#030403;padding:32px 20px;font-family:Inter,system-ui,Arial,sans-serif;color:#f7efe3;">
      <div style="max-width:560px;margin:0 auto;background:#0a0c0a;border:1px solid rgba(255,153,0,0.25);border-radius:8px;overflow:hidden;">
        <div style="padding:20px 24px 8px;text-align:center;border-bottom:1px solid rgba(255,153,0,0.15);">
          <div style="font-family:monospace;font-size:11px;letter-spacing:1px;color:#ff9900;">MWZ / ADVERTISING</div>
          <h1 style="margin:8px 0 4px;font-size:22px;color:#fff6de;font-weight:800;text-transform:uppercase;">You're on the list.</h1>
          <p style="margin:0;color:#b9ad9d;font-size:15px;">We'll notify you when search and featured ad slots open.</p>
        </div>
        <div style="padding:22px 24px 26px;font-size:14px;line-height:1.65;color:#e8d0ad;">
          <p style="margin:0;">Thanks for your interest, ${safeEmail}. This was a paid placement notice, not a newsletter signup.</p>
        </div>
      </div>
    </div>
  `;
  return { subject, text, html };
}

function buildInternalNotification(email, source) {
  const safe = String(email).trim();
  const advertise = source === "advertise";
  return {
    subject: advertise
      ? `New advertise waitlist signup: ${safe}`
      : `New MemeWarzone Dispatch subscriber: ${safe}`,
    text: advertise
      ? `New advertise-notify signup from search/featured:\n\n${safe}\n\nTime: ${new Date().toISOString()}\n`
      : `New newsletter signup on memewar.zone landing:\n\n${safe}\n\nTime: ${new Date().toISOString()}\n`,
    html: advertise
      ? `<p>New advertise waitlist signup:</p><p><strong>${safe}</strong></p><p style="color:#666;font-size:12px">${new Date().toISOString()}</p>`
      : `<p>New newsletter signup:</p><p><strong>${safe}</strong></p><p style="color:#666;font-size:12px">${new Date().toISOString()}</p>`,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return badMethod(res);

  const body = await readJson(req);
  const email = String(body?.email || "").trim().toLowerCase();
  const source = String(body?.source || "newsletter").trim().toLowerCase();
  const advertise = source === "advertise";

  if (!isValidEmail(email)) {
    return json(res, 400, { error: "Valid email is required." });
  }

  const cfg = getResendConfig();
  if (!cfg.apiKey) {
    console.error("[api/newsletter] Missing RESEND_API_KEY");
    return json(res, 500, { error: "Newsletter service not configured." });
  }

  try {
    const welcome = advertise ? buildAdvertiseThankYou(email) : buildNewsletterThankYou(email);
    await sendResendEmail({
      apiKey: cfg.apiKey,
      from: cfg.from,
      to: email,
      subject: welcome.subject,
      html: welcome.html,
      text: welcome.text,
      replyTo: cfg.replyTo || undefined,
      headers: advertise
        ? undefined
        : {
            "List-Unsubscribe": `<mailto:unsubscribe@updates.memewar.zone>, <${welcome.unsubscribeUrl || "https://memewar.zone/unsubscribe"}>`,
          },
    });

    try {
      const note = buildInternalNotification(email, source);
      await sendResendEmail({
        apiKey: cfg.apiKey,
        from: cfg.from,
        to: cfg.from, // sends to the configured inbox
        subject: note.subject,
        html: note.html,
        text: note.text,
      });
    } catch (notifyErr) {
      // Non-fatal — subscriber still got their thank-you
      console.warn("[api/newsletter] internal notification failed", notifyErr?.message || notifyErr);
    }

    return json(res, 200, { success: true });
  } catch (err) {
    console.error("[api/newsletter] Resend failed", err);
    return json(res, 500, { error: "Failed to process subscription. Please try again later." });
  }
}
