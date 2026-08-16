import assert from "node:assert/strict";
import test from "node:test";

import { sendEmailNotification, shouldRetryEmailStatus } from "./notify.js";

test("retries 429 and 5xx, not 400", () => {
  assert.equal(shouldRetryEmailStatus(429), true);
  assert.equal(shouldRetryEmailStatus(503), true);
  assert.equal(shouldRetryEmailStatus(400), false);
  assert.equal(shouldRetryEmailStatus(401), false);
});

test("sendEmailNotification retries provider failures then succeeds", async () => {
  const calls = [];
  process.env.RESEND_API_KEY = "re_test";
  const result = await sendEmailNotification({
    to: "reporter@example.com",
    subject: "MemeWarzone Abuse Report MWZ-AB-000001 received",
    text: "Report MWZ-AB-000001",
    attempts: 3,
    delaysMs: [0, 0],
    sleep: async () => {},
    fetchImpl: async () => {
      calls.push(1);
      if (calls.length < 3) {
        return { ok: false, status: 503, text: async () => "busy" };
      }
      return { ok: true, status: 200, text: async () => "{}" };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
  assert.equal(calls.length, 3);
});

test("sendEmailNotification does not retry a 400", async () => {
  const calls = [];
  process.env.RESEND_API_KEY = "re_test";
  await assert.rejects(() => sendEmailNotification({
    to: "reporter@example.com",
    subject: "bad",
    text: "bad",
    attempts: 3,
    delaysMs: [0, 0],
    sleep: async () => {},
    fetchImpl: async () => {
      calls.push(1);
      return { ok: false, status: 400, text: async () => "nope" };
    },
  }));
  assert.equal(calls.length, 1);
});
