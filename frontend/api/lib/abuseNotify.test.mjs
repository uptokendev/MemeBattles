import assert from "node:assert/strict";
import test from "node:test";

import {
  ABUSE_NOTIFY_EVENTS,
  buildAbuseNotification,
  notificationLooksSafe,
  notifyAbuseReporter,
  notifyEventForAdminAction,
} from "./abuseNotify.js";

test("notification copy names the report and never includes case details", () => {
  const payload = buildAbuseNotification({
    eventType: ABUSE_NOTIFY_EVENTS.ADMIN_REPLIED,
    publicReference: "MWZ-AB-000142",
  });
  assert.equal(payload.subject, "MemeWarzone Abuse Report MWZ-AB-000142 updated");
  assert.match(payload.text, /MWZ-AB-000142/);
  assert.match(payload.text, /Command Center/);
  assert.equal(payload.text.includes("cluster"), false);
  assert.equal(payload.text.includes("evidence"), false);
  assert.equal(notificationLooksSafe(payload), true);
});

test("internal notes and assignment changes do not create emails", () => {
  assert.equal(notifyEventForAdminAction({ visibility: "internal", eventType: "INTERNAL_NOTE_ADDED" }), null);
  assert.equal(notifyEventForAdminAction({ eventType: "PRIORITY_CHANGED", status: "OPEN" }), null);
  assert.equal(notifyEventForAdminAction({ eventType: "ADMIN_ASSIGNED" }), null);
});

test("reply, information request, resolve and reopen map to notify events", () => {
  assert.equal(notifyEventForAdminAction({ visibility: "reporter", eventType: "MESSAGE_SENT" }), "ADMIN_REPLIED");
  assert.equal(notifyEventForAdminAction({ status: "WAITING_FOR_REPORTER", eventType: "STATUS_CHANGED" }), "ADDITIONAL_INFORMATION_REQUESTED");
  assert.equal(notifyEventForAdminAction({ status: "RESOLVED", eventType: "REPORT_RESOLVED" }), "REPORT_RESOLVED");
  assert.equal(notifyEventForAdminAction({ eventType: "REPORT_REOPENED", status: "UNDER_REVIEW" }), "REPORT_REOPENED");
});

test("notifyAbuseReporter sends only to the reporter email and can be skipped", async () => {
  const sent = [];
  await notifyAbuseReporter({
    eventType: ABUSE_NOTIFY_EVENTS.REPORT_RESOLVED,
    report: { public_reference: "MWZ-AB-000007", reporter_email: "reporter@example.com" },
    send: async (payload) => {
      sent.push(payload);
      return { ok: true };
    },
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "reporter@example.com");
  assert.equal(sent[0].subject.includes("MWZ-AB-000007"), true);
  assert.equal(String(sent[0].text).includes("reporter@example.com"), false);

  const skipped = await notifyAbuseReporter({
    eventType: ABUSE_NOTIFY_EVENTS.ADMIN_REPLIED,
    report: { public_reference: "MWZ-AB-000008" },
    send: async () => {
      throw new Error("should not send");
    },
  });
  assert.equal(skipped.skipped, true);
});
