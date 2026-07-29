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
    }
  }

  const pool = await getLifecyclePool();
  return runJsonTransform(baseDraftDeploy, req, res, async (payload) => {
    if (!payload?.draft?.id) return payload;
    const row = await loadDraftRowById(pool, payload.draft.id);
    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };
  });
}
