import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function loadEthers() {
  try {
    const mod = await import("ethers");
    return mod.ethers;
  } catch (error) {
    const hardhat = require("hardhat");
    if (hardhat?.ethers) return hardhat.ethers;
    throw error;
  }
}

const ethers = await loadEthers();

export const CREATE_AUTH_TYPES = ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"];
export const TRADE_AUTH_TYPES = ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"];
export const REQUEST_HASH_TYPES = ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32"];

const coder = ethers.AbiCoder.defaultAbiCoder();

function textHash(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(value ?? "")));
}

function toBigInt(value, label) {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be a uint-compatible value`);
  }
}

export function hashCampaignRequest(request) {
  return ethers.keccak256(
    coder.encode(REQUEST_HASH_TYPES, [
      textHash(request?.name),
      textHash(request?.symbol),
      textHash(request?.logoURI),
      textHash(request?.xAccount),
      textHash(request?.website),
      textHash(request?.extraLink),
    ]),
  );
}

export function buildCreateAuthorizationDigest({
  chainId,
  factoryAddress,
  factory = factoryAddress,
  creator,
  request,
  requestHash = hashCampaignRequest(request),
  tradeRouteProfileId,
  tradeRouteProfile = tradeRouteProfileId,
  finalizeRouteProfileId,
  finalizeRouteProfile = finalizeRouteProfileId,
  deadline,
}) {
  return ethers.keccak256(
    coder.encode(CREATE_AUTH_TYPES, [
      "MWZ_CREATE_ROUTE_AUTH",
      toBigInt(chainId, "chainId"),
      ethers.getAddress(factory),
      ethers.getAddress(creator),
      requestHash,
      Number(tradeRouteProfile),
      Number(finalizeRouteProfile),
      toBigInt(deadline, "deadline"),
    ]),
  );
}

export async function signCreateAuthorization(options) {
  const digest = buildCreateAuthorizationDigest(options);
  return options.signer.signMessage(ethers.getBytes(digest));
}

export function buildTradeAuthorizationDigest({
  chainId,
  campaignAddress,
  campaign = campaignAddress,
  actor,
  routeProfileId,
  routeProfile = routeProfileId,
  action,
  amount,
  limit,
  deadline,
}) {
  return ethers.keccak256(
    coder.encode(TRADE_AUTH_TYPES, [
      "MWZ_ROUTE_TRADE_AUTH",
      toBigInt(chainId, "chainId"),
      ethers.getAddress(campaign),
      ethers.getAddress(actor),
      Number(routeProfile),
      Number(action),
      toBigInt(amount, "amount"),
      toBigInt(limit, "limit"),
      toBigInt(deadline, "deadline"),
    ]),
  );
}

export async function signTradeAuthorization(options) {
  const digest = buildTradeAuthorizationDigest(options);
  return options.signer.signMessage(ethers.getBytes(digest));
}
