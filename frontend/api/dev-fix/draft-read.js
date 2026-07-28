import * as base from "./draft-read-base.js";

import { runJsonTransform } from "./json-transform.js";
import {
  augmentDraftLifecycle,
  getLifecyclePool,
  loadDraftRowById,
  reconcileScheduledDraftLifecycle,
} from "./scheduled-lifecycle.js";

async function runSignedLifecycle(handler, req, res) {
  const pool = await getLifecyclePool();
  await reconcileScheduledDraftLifecycle(pool);
  return runJsonTransform(handler, req, res, async (payload) => {
    if (!payload?.draft?.id) return payload;
    const row = await loadDraftRowById(pool, payload.draft.id);
    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };
  });
}

export async function signedDraftById(req, res) {
  return runSignedLifecycle(base.signedDraftById, req, res);
}

export async function signedPrepareBySlug(req, res) {
  return runSignedLifecycle(base.signedPrepareBySlug, req, res);
}
