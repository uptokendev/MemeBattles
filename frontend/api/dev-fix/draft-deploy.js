import { ethers } from "ethers";
import { json, readJson } from "../../server/http.js";
import { draftDeploy as baseDraftDeploy } from "./draft-deploy-base.js";
import { solanaCreateAuthorizationV4 } from "./solana-create-authorization-v4.js";

import { runJsonTransform } from "./json-transform.js";
import {
  augmentDraftLifecycle,
  getLifecyclePool,
  loadDraftRowById,
} from "./scheduled-lifecycle.js";

const OBSOLETE_BSC_TESTNET_SCHEDULED_FACTORY = "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6";
const EXPECTED_FACTORY_GENERATION = 3;
const EXPECTED_CAMPAIGN_GENERATION = 2;
const CREATION_PREFLIGHT_ABI = [
  "function live() view returns (bool)",
  "function globalPaused() view returns (bool)",
  "function createPaused() view returns (bool)",
  "function routeAuthority() view returns (address)",
  "function FACTORY_GENERATION() view returns (uint32)",
  "function CAMPAIGN_GENERATION() view returns (uint32)",
  "function creatorLaunchEligibility(address creator) view returns (bool allowed,uint256 cooldownEndsAt,uint256 currentLiveCount,uint256 maxLiveBonding)",
];

function configuredScheduledFactory(chainId) {
  const id = Number(chainId);
  const configured = String(
    process.env[`SCHEDULED_FACTORY_ADDRESS_${id}`] ||
      process.env[`SCHEDULED_LAUNCH_FACTORY_ADDRESS_${id}`] ||
      process.env[`VITE_SCHEDULED_FACTORY_ADDRESS_${id}`] ||
      process.env.SCHEDULED_FACTORY_ADDRESS ||
      process.env.SCHEDULED_LAUNCH_FACTORY_ADDRESS ||
      "",
  ).trim();
  if (!ethers.isAddress(configured)) return "";
  const address = ethers.getAddress(configured);
  if (id === 97 && address.toLowerCase() === OBSOLETE_BSC_TESTNET_SCHEDULED_FACTORY.toLowerCase()) return "";
  return address;
}

function firstCsvValue(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";
}

function rpcUrlForChain(chainId) {
  return firstCsvValue(
    process.env[`BSC_RPC_HTTP_${chainId}`] ||
      process.env[`VITE_PUBLIC_RPC_${chainId}`] ||
      (Number(chainId) === 97 ? process.env.VITE_BSC_TESTNET_RPC : process.env.VITE_BSC_MAINNET_RPC),
  );
}

function routeSignerAddress() {
  const privateKey = String(
    process.env.ROUTE_AUTHORITY_PRIVATE_KEY ||
      process.env.MWZ_ROUTE_AUTHORITY_PRIVATE_KEY ||
      process.env.ROUTE_AUTH_PRIVATE_KEY ||
      "",
  ).trim();
  if (!privateKey) return "";
  try {
    return new ethers.Wallet(privateKey).address;
  } catch {
    return "";
  }
}

async function verifyCurrentScheduledArmEligibility({ chainId, factoryAddress, walletAddress }) {
  const rpcUrl = rpcUrlForChain(chainId);
  if (!rpcUrl) {
    return { ok: false, status: 503, code: "SCHEDULED_CREATE_RPC_NOT_CONFIGURED", error: "RPC URL is missing for scheduled creation." };
  }
  if (!ethers.isAddress(walletAddress)) {
    return { ok: false, status: 400, code: "SCHEDULED_CREATE_WALLET_INVALID", error: "Invalid or missing creator wallet." };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });
    const code = await provider.getCode(factoryAddress);
    if (!code || code === "0x") {
      return { ok: false, status: 409, code: "SCHEDULED_CREATE_FACTORY_CODE_MISSING", error: "The configured scheduled factory has no contract code." };
    }

    const factory = new ethers.Contract(factoryAddress, CREATION_PREFLIGHT_ABI, provider);
    const [live, globalPaused, createPaused, routeAuthority, factoryGenerationRaw, campaignGenerationRaw, eligibility] = await Promise.all([
      factory.live(),
      factory.globalPaused(),
      factory.createPaused(),
      factory.routeAuthority(),
      factory.FACTORY_GENERATION(),
      factory.CAMPAIGN_GENERATION(),
      factory.creatorLaunchEligibility(ethers.getAddress(walletAddress)),
    ]);

    const factoryGeneration = Number(factoryGenerationRaw);
    const campaignGeneration = Number(campaignGenerationRaw);
    if (factoryGeneration !== EXPECTED_FACTORY_GENERATION || campaignGeneration !== EXPECTED_CAMPAIGN_GENERATION) {
      return {
        ok: false,
        status: 409,
        code: "SCHEDULED_CREATE_FACTORY_GENERATION_MISMATCH",
        error: `Scheduled creation requires factory/campaign generation ${EXPECTED_FACTORY_GENERATION}/${EXPECTED_CAMPAIGN_GENERATION}; configured factory reports ${factoryGeneration}/${campaignGeneration}.`,
      };
    }
    if (!live || globalPaused || createPaused) {
      return {
        ok: false,
        status: 503,
        code: "SCHEDULED_CREATE_FACTORY_NOT_READY",
        error: !live ? "The corrected scheduled factory is not live." : globalPaused ? "The scheduled factory is globally paused." : "New campaign creation is paused.",
      };
    }

    const signerAddress = routeSignerAddress();
    if (!signerAddress || signerAddress.toLowerCase() !== String(routeAuthority).toLowerCase()) {
      return {
        ok: false,
        status: 503,
        code: "SCHEDULED_CREATE_ROUTE_AUTHORITY_MISMATCH",
        error: "Configured route signer does not match the active scheduled factory route authority.",
      };
    }

    const allowed = Boolean(eligibility.allowed ?? eligibility[0]);
    const cooldownEndsAt = Number(eligibility.cooldownEndsAt ?? eligibility[1] ?? 0);
    const onChainLiveCampaignCount = Number(eligibility.currentLiveCount ?? eligibility[2] ?? 0);
    const onChainLiveCampaignLimit = Number(eligibility.maxLiveBonding ?? eligibility[3] ?? 0);
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        code: "SCHEDULED_CREATE_ONCHAIN_ELIGIBILITY_BLOCKED",
        error: cooldownEndsAt > Math.floor(Date.now() / 1000)
          ? `This creator wallet cannot deploy or arm another campaign until ${new Date(cooldownEndsAt * 1000).toISOString()}. The selected trading-open time does not affect this cooldown.`
          : onChainLiveCampaignCount >= onChainLiveCampaignLimit
            ? "This creator wallet has reached its deployed, non-graduated campaign limit."
            : "This creator wallet cannot deploy or arm another campaign right now.",
        preflight: { allowed, cooldownEndsAt, onChainLiveCampaignCount, onChainLiveCampaignLimit, factoryGeneration, campaignGeneration },
      };
    }

    return {
      ok: true,
      preflight: { allowed, canArmNow: true, cooldownEndsAt, onChainLiveCampaignCount, onChainLiveCampaignLimit, factoryGeneration, campaignGeneration },
    };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "SCHEDULED_CREATE_ONCHAIN_PREFLIGHT_FAILED",
      error: `Current on-chain scheduled creation eligibility could not be verified: ${String(error?.shortMessage || error?.message || error)}`,
    };
  }
}

function isUnsignedDecimal(value, { allowZero = true } = {}) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return false;
  if (!allowZero && /^0+$/.test(raw)) return false;
  try {
    const parsed = BigInt(raw);
    return parsed >= 0n && (allowZero || parsed > 0n);
  } catch {
    return false;
  }
}

export async function draftDeploy(req, res) {
  if (req.method === "POST") {
    const body = await readJson(req);
    req.body = body;
    const operation = String(body?.operation || "").trim().toLowerCase();

    if (operation === "authorize_solana_v4") {
      if (!String(process.env.SOLANA_GENERATION_MANIFEST_HASH || "").trim()) {
        return json(res, 503, {
          error: "SOLANA_GENERATION_MANIFEST_HASH is not configured.",
          code: "SOLANA_CREATE_CONFIGURATION_INCOMPLETE",
        });
      }
      if (!isUnsignedDecimal(body?.graduationTargetUsdMicros, { allowZero: false })) {
        return json(res, 400, {
          error: "graduationTargetUsdMicros must be a positive unsigned integer.",
          code: "SOLANA_GRADUATION_TARGET_INVALID",
        });
      }
      if (body?.launchAt != null && String(body.launchAt).trim() !== "" && !isUnsignedDecimal(body.launchAt)) {
        return json(res, 400, {
          error: "launchAt must be zero or an unsigned Unix timestamp.",
          code: "SOLANA_LAUNCH_TIME_INVALID",
        });
      }
      return solanaCreateAuthorizationV4(req, res);
    }

    if (operation === "authorize_scheduled") {
      const chainId = Number(body.chainId || body.auth?.chainId || 0);
      const expected = configuredScheduledFactory(chainId);
      const supplied = String(body.factoryAddress || "").trim();
      if (!expected) {
        return json(res, 503, {
          error: "The corrected scheduled LaunchFactory is not configured. The obsolete BSC Testnet factory is blocked for new campaigns.",
          code: "SCHEDULED_FACTORY_NOT_CONFIGURED",
        });
      }
      if (!ethers.isAddress(supplied) || ethers.getAddress(supplied) !== expected) {
        return json(res, 409, {
          error: `Scheduled factory mismatch. Refresh the application and try again with ${expected}.`,
          code: "SCHEDULED_FACTORY_MISMATCH",
          expectedFactoryAddress: expected,
        });
      }

      const onChainPreflight = await verifyCurrentScheduledArmEligibility({
        chainId,
        factoryAddress: expected,
        walletAddress: body.auth?.walletAddress || body.walletAddress,
      });
      if (!onChainPreflight.ok) {
        return json(res, onChainPreflight.status || 503, {
          error: onChainPreflight.error,
          code: onChainPreflight.code,
          preflight: onChainPreflight.preflight || null,
        });
      }
      req.body = { ...body, onChainPreflight: onChainPreflight.preflight };
    }
  }

  const pool = await getLifecyclePool();
  return runJsonTransform(baseDraftDeploy, req, res, async (payload) => {
    if (!payload?.draft?.id) return payload;
    const row = await loadDraftRowById(pool, payload.draft.id);
    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };
  });
}
