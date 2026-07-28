import * as base from "./drafts-base.js";
export * from "./drafts-base.js";

import { getQuery, json } from "../../server/http.js";
import { runJsonTransform } from "./json-transform.js";
import {
  augmentDraftLifecycle,
  enrichDraftItems,
  getLifecyclePool,
  listPublicCampaignLifecycleDrafts,
  loadDraftRowById,
  reconcileScheduledDraftLifecycle,
} from "./scheduled-lifecycle.js";

async function enrichPayload(payload, pool) {
  if (!payload || typeof payload !== "object") return payload;

  if (Array.isArray(payload.items)) {
    return { ...payload, items: await enrichDraftItems(pool, payload.items) };
  }

  if (payload.draft?.id) {
    const row = await loadDraftRowById(pool, payload.draft.id);
    return { ...payload, draft: augmentDraftLifecycle(payload.draft, row) };
  }

  return payload;
}

function mergeDraftItems(primary, lifecycle) {
  const byId = new Map();
  for (const item of [...(primary || []), ...(lifecycle || [])]) {
    const id = String(item?.id || "");
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...item });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(b.draftCreatedAt || b.createdAt || "").localeCompare(String(a.draftCreatedAt || a.createdAt || "")),
  );
}

async function runLifecycleWrapped(handler, req, res) {
  const pool = await getLifecyclePool();
  await reconcileScheduledDraftLifecycle(pool);
  return runJsonTransform(handler, req, res, (payload) => enrichPayload(payload, pool));
}

export async function drafts(req, res) {
  const query = getQuery(req);
  const lifecycleMode = req.method === "GET" && String(query.lifecycle || "").toLowerCase() === "campaign";

  if (lifecycleMode) {
    const pool = await getLifecyclePool();
    if (!pool) return json(res, 200, { items: [] });
    const chainId = query.chainId ? Number(query.chainId) : null;
    const limit = Math.max(1, Math.min(500, Number(query.limit || 200) || 200));
    const items = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit });
    return json(res, 200, { items });
  }

  const pool = await getLifecyclePool();
  await reconcileScheduledDraftLifecycle(pool);

  return runJsonTransform(base.drafts, req, res, async (payload) => {
    const enriched = await enrichPayload(payload, pool);
    const isPublicList = req.method === "GET" && !String(query.owner || "").trim();
    if (!isPublicList || !Array.isArray(enriched?.items) || !pool) return enriched;

    const chainId = query.chainId ? Number(query.chainId) : null;
    const limit = Math.max(1, Math.min(500, Number(query.limit || 50) || 50));
    const lifecycleItems = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit });

    return {
      ...enriched,
      items: mergeDraftItems(enriched.items, lifecycleItems).slice(0, limit),
    };
  });
}

export async function draftById(req, res) {
  return runLifecycleWrapped(base.draftById, req, res);
}

export async function prepareBySlug(req, res) {
  return runLifecycleWrapped(base.prepareBySlug, req, res);
}

export async function draftPromotion(req, res) {
  return runLifecycleWrapped(base.draftPromotion, req, res);
}

export async function draftArchive(req, res) {
  return runLifecycleWrapped(base.draftArchive, req, res);
}
