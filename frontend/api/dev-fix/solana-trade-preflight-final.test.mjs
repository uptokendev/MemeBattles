import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const auth = fs.readFileSync(new URL("./solana-trade-authorization-v1.js", import.meta.url), "utf8");
const rust = fs.readFileSync(new URL("../../../programs/memewarzone_solana/src/authorized_trade.rs", import.meta.url), "utf8");

function before(left, right) {
  assert.ok(auth.indexOf(left) >= 0, `missing ${left}`);
  assert.ok(auth.indexOf(right) >= 0, `missing ${right}`);
  assert.ok(auth.indexOf(left) < auth.indexOf(right), `${left} must execute before ${right}`);
}

test("trade authorization is fail-closed before route signing", () => {
  for (const marker of [
    "SOLANA_LAUNCHPAD_PAUSED",
    "SOLANA_BUYS_PAUSED",
    "SOLANA_SELLS_PAUSED",
    "SOLANA_TRADE_SECURITY_NOT_LOCKED",
    "SOLANA_ROUTE_SIGNER_ONCHAIN_MISMATCH",
    "SOLANA_REWARD_VAULTS_NOT_READY",
  ]) assert.match(auth, new RegExp(marker));

  for (const code of [
    "SOLANA_WALLET_RESTRICTED",
    "SOLANA_WALLET_MANUAL_REVIEW",
    "SOLANA_CLUSTER_RESTRICTED",
  ]) {
    const codeIndex = auth.indexOf(`code: "${code}"`);
    assert.ok(codeIndex >= 0, `missing ${code}`);
    const statusIndex = auth.indexOf("httpStatus: 403", codeIndex);
    assert.ok(
      statusIndex > codeIndex && statusIndex - codeIndex < 180,
      `${code} must remain an HTTP 403 preflight rejection`,
    );
  }

  const sign = "const signature = signer.sign(digest)";
  before("await assertTradeGlobalPreflight", sign);
  before("await assertRewardVaultPreflight", sign);
  before("await resolveTraderClusterProfile", sign);
  before("assertCurveOpen", sign);
  before("await resolveRouteProfile", sign);
  assert.equal(auth.indexOf(sign), auth.lastIndexOf(sign), "authorization digest must be signed in exactly one place");
});

test("BPF trade path keeps signed authorization but drops risk/cluster deserialization", () => {
  assert.doesNotMatch(rust, /enforce_trade_risk\s*\(/);
  assert.doesNotMatch(rust, /load_risk_profile_or_default/);
  assert.match(rust, /verify_buy_authorization\s*\(/);
  assert.match(rust, /verify_sell_authorization\s*\(/);
  assert.match(rust, /security_defaults_locked/);
  assert.match(rust, /authorized_trading_required/);
});
