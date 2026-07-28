import assert from "node:assert/strict";
import test from "node:test";

import { solanaCreateAuthorizationV4 } from "./solana-create-authorization-v4.js";

function responseRecorder() {
  let body = null;
  return {
    statusCode: 200,
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(String(name).toLowerCase(), value);
    },
    end(value) {
      body = value == null || value === "" ? null : JSON.parse(String(value));
    },
    get body() {
      return body;
    },
  };
}

function request(body = {}, draftId = "draft-id") {
  return {
    method: "POST",
    body,
    params: { draftId },
    async *[Symbol.asyncIterator]() {
      // Express has already populated req.body in production.
    },
  };
}

async function withEnv(values, work) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  }
  try {
    return await work();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Solana create authorization is disabled by default", async () => {
  await withEnv({ SOLANA_CREATE_AUTH_ENABLED: null }, async () => {
    const res = responseRecorder();
    await solanaCreateAuthorizationV4(request({}), res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, "SOLANA_CREATE_AUTH_DISABLED");
  });
});

test("enabled endpoint rejects a missing draft id before database access", async () => {
  await withEnv({ SOLANA_CREATE_AUTH_ENABLED: "true" }, async () => {
    const res = responseRecorder();
    await solanaCreateAuthorizationV4(request({}, ""), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "DRAFT_ID_REQUIRED");
  });
});

test("Direct Create remains blocked until canonical reservation preflight exists", async () => {
  await withEnv({ SOLANA_CREATE_AUTH_ENABLED: "true" }, async () => {
    const res = responseRecorder();
    await solanaCreateAuthorizationV4(request({ mode: "direct_create" }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "SOLANA_DIRECT_CREATE_NOT_READY");
  });
});
