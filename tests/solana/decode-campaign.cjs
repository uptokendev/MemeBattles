"use strict";

const { PublicKey } = require("@solana/web3.js");

function readPk(buf, offset) {
  return new PublicKey(buf.subarray(offset, offset + 32));
}

function read32(buf, offset) {
  return Buffer.from(buf.subarray(offset, offset + 32));
}

/** Decode an Anchor #[account] Campaign written by create_campaign. */
function decodeCampaign(data) {
  const buf = Buffer.from(data);
  let o = 8;
  const take32 = () => {
    const v = read32(buf, o);
    o += 32;
    return v;
  };
  const takePk = () => {
    const v = readPk(buf, o);
    o += 32;
    return v;
  };
  const takeU64 = () => {
    const v = buf.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const takeI64 = () => {
    const v = buf.readBigInt64LE(o);
    o += 8;
    return v;
  };
  const takeU8 = () => buf[o++];
  const takeU16 = () => {
    const v = buf.readUInt16LE(o);
    o += 2;
    return v;
  };

  const campaign = {
    campaignId: take32(),
    generationId: take32(),
    generationConfig: takePk(),
    generationManifestHash: take32(),
    creator: takePk(),
    mint: takePk(),
    tokenVault: takePk(),
    solVault: takePk(),
    metadataHash: take32(),
    clusterHash: take32(),
    tickerHash: take32(),
    reservationIdHash: take32(),
    reservationVersion: takeU64(),
    launchAt: takeI64(),
    graduationTargetUsdMicros: takeU64(),
    clusterKind: takeU8(),
    economicsVersion: takeU16(),
    curveKind: takeU8(),
    tokenTotalSupply: takeU64(),
    curveTokenSupply: takeU64(),
    liquidityTokenSupply: takeU64(),
    reserveTokenSupply: takeU64(),
    tokenDecimals: takeU8(),
    curveSupplyBps: takeU16(),
    liquidityTokenBps: takeU16(),
    basePriceLamports: takeU64(),
    priceSlopeLamports: takeU64(),
    buyFeeBps: takeU16(),
    sellFeeBps: takeU16(),
    finalizeFeeBps: takeU16(),
    creatorPostFinalizeBps: takeU16(),
    liquidityPostFinalizeBps: takeU16(),
    dexAdapter: takeU8(),
    tradeRouteProfile: take32(),
    finalizeRouteProfile: take32(),
    treasuryProfile: take32(),
    dexProfile: take32(),
    oracleProfile: take32(),
    creatorBuyLockUntil: takeI64(),
    creatorBuyCapBps: takeU16(),
    createdAt: takeI64(),
    soldTokens: takeU64(),
    netRaisedLamports: takeU64(),
    totalBuyVolumeLamports: takeU64(),
    totalSellVolumeLamports: takeU64(),
    buyerCount: takeU64(),
    creatorBoughtTokens: takeU64(),
    assetInitializationVersion: takeU16(),
    mintAuthorityRevoked: takeU8() === 1,
    graduated: takeU8() === 1,
    curveClosed: buf.length > o ? takeU8() === 1 : false,
    paused: buf.length > o ? takeU8() === 1 : false,
  };
  return campaign;
}

function decodeCreateAuthorization(data) {
  const buf = Buffer.from(data);
  let o = 8;
  const creator = readPk(buf, o); o += 32;
  const nonce = read32(buf, o); o += 32;
  const deadline = buf.readBigInt64LE(o); o += 8;
  const usedAt = buf.readBigInt64LE(o); o += 8;
  const routeSigner = readPk(buf, o); o += 32;
  const messageHash = read32(buf, o); o += 32;
  const schemaVersion = buf.readUInt16LE(o); o += 2;
  return { creator, nonce, deadline, usedAt, routeSigner, messageHash, schemaVersion };
}

function decodeCampaignSolVault(data) {
  const buf = Buffer.from(data);
  let o = 8;
  const campaign = readPk(buf, o); o += 32;
  const generationId = read32(buf, o); o += 32;
  const createdAt = buf.readBigInt64LE(o);
  return { campaign, generationId, createdAt };
}

module.exports = {
  decodeCampaign,
  decodeCreateAuthorization,
  decodeCampaignSolVault,
};
