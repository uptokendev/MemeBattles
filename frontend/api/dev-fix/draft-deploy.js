import { json } from "../../server/http.js";
import { draftDeploy as baseDraftDeploy } from "./draft-deploy-base.js";
import { solanaCreateAuthorizationV4 } from "./solana-create-authorization-v4.js";

import { runJsonTransform } from "./json-transform.js";
import {
  augmentDraftLifecycle,
  getLifecyclePool,
  loadDraftRowById,
} from "./scheduled-lifecycle.js";

export async function draftDeploy(req, res) {
  const operation = String(req.body?.operation || "").trim().toLowerCase();
  if (operation === "authorize_solana_v4") {
    if (!String(process.env.SOLANA_GENERATION_MANIFEST_HASH || "").trim()) {
      return json(res, 503, {
        error: "SOLANA_GENERATION_MANIFEST_HASH is not configured.",
        code: "SOLANA_CREATE_CONFIGURATION_INCOMPLETE",
      });
    }
    if (req.body?.graduationTargetUsdMicros == null || String(req.body.graduationTargetUsdMicros).trim() === "") {
      return json(res, 400, {
        error: "graduationTargetUsdMicros is required.",
        code: "SOLANA_GRADUATION_TARGET_REQUIRED",
      });
    }
    return solanaCreateAuthorizationV4(req, res);
  }

  const pool = await getLifecyclePool();
  return runJsonTransform(baseDraftDeploy, req, res, async (payload) => {
    if (!payload?.draft?.id) return payload;
    const row = await loadDraftRowById(pool, payload.draft.id);
    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };
  });
}
