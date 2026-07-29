import { ethers } from "ethers";
import { json, readJson } from "../../server/http.js";
import { draftDeploy as baseDraftDeploy } from "./draft-deploy-base.js";

import { runJsonTransform } from "./json-transform.js";
import {
  augmentDraftLifecycle,
  getLifecyclePool,
  loadDraftRowById,
} from "./scheduled-lifecycle.js";

const BSC_TESTNET_SCHEDULED_FACTORY = "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6";

function configuredScheduledFactory(chainId) {
  const id = Number(chainId);
  if (id === 97) return BSC_TESTNET_SCHEDULED_FACTORY;
  const configured = String(
    process.env[`SCHEDULED_FACTORY_ADDRESS_${id}`] ||
      process.env[`SCHEDULED_LAUNCH_FACTORY_ADDRESS_${id}`] ||
      process.env[`VITE_SCHEDULED_FACTORY_ADDRESS_${id}`] ||
      process.env.SCHEDULED_FACTORY_ADDRESS ||
      process.env.SCHEDULED_LAUNCH_FACTORY_ADDRESS ||
      "",
  ).trim();
  return ethers.isAddress(configured) ? ethers.getAddress(configured) : "";
}

export async function draftDeploy(req, res) {
  if (req.method === "POST") {
    const body = await readJson(req);
    req.body = body;
    if (body?.operation === "authorize_scheduled") {
      const chainId = Number(body.chainId || body.auth?.chainId || 0);
      const expected = configuredScheduledFactory(chainId);
      const supplied = String(body.factoryAddress || "").trim();
      if (!expected) {
        return json(res, 503, {
          error: "Scheduled LaunchFactory is not configured for this chain.",
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
