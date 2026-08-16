import assert from "node:assert/strict";
import test from "node:test";

import { createAbuseReporterHandlers } from "./handlers.js";
import { hashAbuseSessionToken } from "../lib/abuseReporterAuth.js";

const WALLET_A = "0x1111111111111111111111111111111111111111";
const WALLET_B = "0x2222222222222222222222222222222222222222";

function mockRes() {
  return {
    headersSent: false,
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
}

function createMemory() {
  const sessions = new Map();
  const reports = [];
  const messages = [];
  const evidence = [];
  const events = [];
  let seq = 0;

  return {
    reports,
    messages,
    events,
    async query(sql, params = []) {
      const text = String(sql);

      if (text.includes("update public.abuse_reporter_sessions")) {
        const row = sessions.get(params[0]);
        if (!row || row.revokedAt || row.expiresAt <= Date.now()) return { rows: [] };
        return { rows: [{ wallet_address: row.wallet, chain_id: row.chainId, expires_at: new Date(row.expiresAt) }] };
      }

      if (text.includes("nextval('public.abuse_report_reference_seq')")) {
        seq += 1;
        return { rows: [{ seq }] };
      }

      if (text.includes("status = any(") && text.includes("abuse_reports")) {
        const [wallet, category, statuses, reportedWallet, campaign, token, url] = params;
        const row = reports.find((item) => (
          item.reporter_wallet === wallet
          && item.category === category
          && statuses.includes(item.status)
          && String(item.reported_wallet || "") === String(reportedWallet || "")
          && String(item.reported_campaign_address || "") === String(campaign || "")
          && String(item.reported_token_address || "") === String(token || "")
          && String(item.reported_url || "") === String(url || "")
        ));
        return { rows: row ? [{ public_reference: row.public_reference }] : [] };
      }

      if (text.includes("select count(*)::int as count") && text.includes("abuse_reports")) {
        const count = reports.filter((row) => row.reporter_wallet === params[0]).length;
        return { rows: [{ count }] };
      }

      if (text.includes("insert into public.abuse_reports")) {
        const row = {
          id: `rep-${reports.length + 1}`,
          public_reference: params[0],
          reporter_wallet: params[1],
          reporter_chain: params[2],
          reporter_email: params[3],
          category: params[4],
          subject: params[5],
          description: params[6],
          reported_entity_type: params[7],
          reported_wallet: params[8],
          reported_profile_id: params[9],
          reported_campaign_address: params[10],
          reported_token_address: params[11],
          reported_url: params[12],
          status: "OPEN",
          priority: "NORMAL",
          created_at: new Date(),
          updated_at: new Date(),
          resolved_at: null,
          closed_at: null,
        };
        reports.push(row);
        return { rows: [row] };
      }

      if (text.includes("insert into public.abuse_report_messages")) {
        const row = {
          id: `msg-${messages.length + 1}`,
          report_id: params[0],
          sender_type: text.includes("'admin'") ? "admin" : "reporter",
          sender_wallet: params[1] || null,
          message: params[2],
          visibility: text.includes("'internal'") ? "internal" : "reporter",
          created_at: new Date(),
        };
        if (text.includes("'internal'")) row.visibility = "internal";
        messages.push(row);
        return { rows: [row] };
      }

      if (text.includes("insert into public.abuse_report_events")) {
        events.push({ reportId: params[0], eventType: params[1], actorType: params[2] });
        return { rows: [] };
      }

      if (text.includes("from public.abuse_reports") && text.includes("public_reference")) {
        const row = reports.find((item) => item.public_reference === params[0] && item.reporter_wallet === params[1]);
        return { rows: row ? [row] : [] };
      }

      if (text.includes("from public.abuse_reports") && text.includes("reporter_wallet")) {
        return { rows: reports.filter((row) => row.reporter_wallet === params[0]) };
      }

      if (text.includes("from public.abuse_report_messages")) {
        return {
          rows: messages.filter((row) => row.report_id === params[0] && row.visibility === "reporter"),
        };
      }

      if (text.includes("from public.abuse_report_evidence")) {
        return { rows: evidence.filter((row) => row.report_id === params[0]) };
      }

      throw new Error(`Unexpected SQL in reporter test: ${text}`);
    },
    addSession(token, wallet, chainId = 97) {
      sessions.set(hashAbuseSessionToken(token), {
        wallet,
        chainId,
        expiresAt: Date.now() + 60_000,
        revokedAt: null,
      });
    },
    addInternalNote(reportId, textValue) {
      messages.push({
        id: `note-${messages.length + 1}`,
        report_id: reportId,
        sender_type: "admin",
        sender_wallet: null,
        message: textValue,
        visibility: "internal",
        created_at: new Date(),
      });
    },
  };
}

function req(path, { method = "GET", token = "", body } = {}) {
  return {
    method,
    url: path,
    originalUrl: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
}

test("unauthenticated reporter list is 401", async () => {
  const handlers = createAbuseReporterHandlers({ pool: createMemory() });
  const res = mockRes();
  await handlers.reports(req("/api/abuse/reports"), res);
  assert.equal(res.statusCode, 401);
});

test("wallet B cannot read wallet A's report and gets no case body", async () => {
  const pool = createMemory();
  const handlers = createAbuseReporterHandlers({ pool });
  pool.addSession("token-a", WALLET_A);
  pool.addSession("token-b", WALLET_B);

  const createRes = mockRes();
  await handlers.reports(req("/api/abuse/reports", {
    method: "POST",
    token: "token-a",
    body: {
      category: "impersonation",
      email: "owner@example.com",
      description: "Someone cloned my profile and is running a fake official token page.",
    },
  }), createRes);
  assert.equal(createRes.statusCode, 200);
  const reference = createRes.body.report.id;
  assert.match(reference, /^MWZ-AB-\d{6}$/);
  assert.equal(Object.hasOwn(createRes.body.report, "internalId"), false);

  const steal = mockRes();
  await handlers.reports(req(`/api/abuse/reports/${reference}`, { token: "token-b" }), steal);
  assert.equal(steal.statusCode, 404);
  assert.equal(Object.hasOwn(steal.body, "report"), false);
  assert.equal(JSON.stringify(steal.body).includes("owner@example.com"), false);
});

test("duplicate open report about the same target is rejected", async () => {
  const pool = createMemory();
  const handlers = createAbuseReporterHandlers({ pool });
  pool.addSession("token-a", WALLET_A);
  const payload = {
    category: "fake_project",
    email: "owner@example.com",
    description: "A fake project is using my branding and claiming I launched it.",
    reportedCampaignAddress: "0xabcabcabcabcabcabcabcabcabcabcabcabcabca",
  };

  const first = mockRes();
  await handlers.reports(req("/api/abuse/reports", { method: "POST", token: "token-a", body: payload }), first);
  assert.equal(first.statusCode, 200);

  const second = mockRes();
  await handlers.reports(req("/api/abuse/reports", { method: "POST", token: "token-a", body: payload }), second);
  assert.equal(second.statusCode, 409);
  assert.equal(second.body.reportId, first.body.report.id);
  assert.equal(pool.reports.length, 1);

  const otherTarget = mockRes();
  await handlers.reports(req("/api/abuse/reports", {
    method: "POST",
    token: "token-a",
    body: { ...payload, reportedCampaignAddress: "0xdddddddddddddddddddddddddddddddddddddddd" },
  }), otherTarget);
  assert.equal(otherTarget.statusCode, 200);
  assert.equal(pool.reports.length, 2);
});

test("internal notes never appear on reporter endpoints", async () => {
  const pool = createMemory();
  const handlers = createAbuseReporterHandlers({ pool });
  pool.addSession("token-a", WALLET_A);

  const createRes = mockRes();
  await handlers.reports(req("/api/abuse/reports", {
    method: "POST",
    token: "token-a",
    body: {
      category: "phishing",
      email: "owner@example.com",
      description: "Phishing site is using my branding and wallet QR.",
    },
  }), createRes);
  const reportId = pool.reports[0].id;
  pool.addInternalNote(reportId, "Wallet also matches cluster ABC. Do not close.");

  const readRes = mockRes();
  await handlers.reports(req(`/api/abuse/reports/${createRes.body.report.id}`, { token: "token-a" }), readRes);
  assert.equal(readRes.statusCode, 200);
  const payload = JSON.stringify(readRes.body);
  assert.equal(payload.includes("cluster ABC"), false);
  assert.equal(readRes.body.report.messages.every((message) => message.senderType !== "internal"), true);
});
