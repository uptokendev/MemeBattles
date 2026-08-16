import assert from "node:assert/strict";
import test from "node:test";

import { buildCommentMessage, canonCampaign, canonWallet } from "./lib/commentsCanon.js";

const SOLANA_CHAIN = 101;
const EVM_CHAIN = 97;
const SOL_CAMPAIGN = "9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H";
const SOL_WALLET = "2AMfRaxS9182AESwWRz2TrvUxPqXaUot4wV1oAvjsTrB";

test("Solana campaign and wallet keep base58 case", () => {
  assert.equal(canonCampaign(SOLANA_CHAIN, SOL_CAMPAIGN), SOL_CAMPAIGN);
  assert.equal(canonCampaign(SOLANA_CHAIN, SOL_CAMPAIGN.toLowerCase()), SOL_CAMPAIGN.toLowerCase());
  assert.equal(canonWallet(SOLANA_CHAIN, SOL_WALLET), SOL_WALLET);
  assert.equal(canonCampaign(SOLANA_CHAIN, "0x52d3c9e6e4e6c5d4c3b2a1908877665544332211"), "");
});

test("EVM campaign and wallet are lowercased", () => {
  assert.equal(
    canonCampaign(EVM_CHAIN, "0x52D3c9E6E4E6C5D4C3B2A1908877665544332211"),
    "0x52d3c9e6e4e6c5d4c3b2a1908877665544332211",
  );
  assert.equal(
    canonWallet(EVM_CHAIN, "0x1111111111111111111111111111111111111111"),
    "0x1111111111111111111111111111111111111111",
  );
});

test("comment message does not lowercase Solana identities", () => {
  const msg = buildCommentMessage({
    chainId: SOLANA_CHAIN,
    address: SOL_WALLET,
    campaignAddress: SOL_CAMPAIGN,
    nonce: "abc",
    body: "First shot from the bunker.",
  });
  assert.match(msg, new RegExp(SOL_WALLET));
  assert.match(msg, new RegExp(SOL_CAMPAIGN));
  assert.equal(msg.includes(SOL_CAMPAIGN.toLowerCase()) && SOL_CAMPAIGN !== SOL_CAMPAIGN.toLowerCase(), false);
  assert.match(msg, /COMMENT_CREATE/);
});
