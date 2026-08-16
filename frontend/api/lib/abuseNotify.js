import { sendEmailNotification, siteOrigin } from "./notify.js";

export const ABUSE_NOTIFY_EVENTS = Object.freeze({
  ADMIN_REPLIED: "ADMIN_REPLIED",
  ADDITIONAL_INFORMATION_REQUESTED: "ADDITIONAL_INFORMATION_REQUESTED",
  REPORT_RESOLVED: "REPORT_RESOLVED",
  REPORT_REOPENED: "REPORT_REOPENED",
});

const COPY = {
  [ABUSE_NOTIFY_EVENTS.ADMIN_REPLIED]: {
    headline: "Your MemeWarzone abuse report has received a response.",
  },
  [ABUSE_NOTIFY_EVENTS.ADDITIONAL_INFORMATION_REQUESTED]: {
    headline: "The Abuse desk needs more information on your report.",
  },
  [ABUSE_NOTIFY_EVENTS.REPORT_RESOLVED]: {
    headline: "Your MemeWarzone abuse report has been marked resolved.",
  },
  [ABUSE_NOTIFY_EVENTS.REPORT_REOPENED]: {
    headline: "Your MemeWarzone abuse report has been reopened.",
  },
};

export function buildAbuseNotification({ eventType, publicReference }) {
  const reference = String(publicReference || "").trim().toUpperCase();
  const copy = COPY[eventType];
  if (!copy || !reference) return null;

  const openUrl = `${siteOrigin()}/command/support/reports/${encodeURIComponent(reference)}`;
  const subject = `MemeWarzone Abuse Report ${reference} updated`;
  const text = [
    copy.headline,
    "",
    "Report:",
    reference,
    "",
    "Open your Command Center to view the response and reply.",
    openUrl,
  ].join("\n");

  return { eventType, publicReference: reference, subject, text, openUrl };
}

export function notificationLooksSafe(payload) {
  if (!payload) return false;
  const blob = `${payload.subject}\n${payload.text}`.toLowerCase();
  if (blob.includes("internal note")) return false;
  if (blob.includes("evidence")) return false;
  if (blob.includes("cluster")) return false;
  return payload.subject.includes(payload.publicReference) && payload.text.includes(payload.publicReference);
}

export async function notifyAbuseReporter({
  eventType,
  report,
  send = sendEmailNotification,
} = {}) {
  const payload = buildAbuseNotification({
    eventType,
    publicReference: report?.public_reference || report?.publicReference || report?.id,
  });
  const to = String(report?.reporter_email || report?.reporterEmail || "").trim();
  if (!payload || !to) return { ok: false, skipped: true, reason: "missing_payload" };
  if (!notificationLooksSafe(payload)) return { ok: false, skipped: true, reason: "unsafe_payload" };

  try {
    return await send({
      to,
      subject: payload.subject,
      text: payload.text,
    });
  } catch (error) {
    console.error("[abuseNotify] send failed", error?.message || error);
    return { ok: false, skipped: false, error: String(error?.message || error) };
  }
}

export function notifyEventForAdminAction({ visibility, status, previousStatus, eventType }) {
  if (visibility === "internal") return null;
  if (visibility === "reporter" || eventType === "MESSAGE_SENT") return ABUSE_NOTIFY_EVENTS.ADMIN_REPLIED;
  if (eventType === "REPORT_REOPENED") return ABUSE_NOTIFY_EVENTS.REPORT_REOPENED;
  if (status === "RESOLVED") return ABUSE_NOTIFY_EVENTS.REPORT_RESOLVED;
  if (status === "WAITING_FOR_REPORTER") return ABUSE_NOTIFY_EVENTS.ADDITIONAL_INFORMATION_REQUESTED;
  if (previousStatus && status && previousStatus !== status && eventType === "REPORT_REOPENED") {
    return ABUSE_NOTIFY_EVENTS.REPORT_REOPENED;
  }
  return null;
}
