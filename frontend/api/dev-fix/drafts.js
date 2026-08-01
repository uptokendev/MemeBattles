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
import {
  loadTickerReservationByDraft,
  loadTickerReservationsByDraftIds,
} from "./ticker-reservation-service.js";

async function enrichPayload(payload, pool) {
  if (!payload || typeof payload !== "object") return payload;

  if (Array.isArray(payload.items)) {
    const items = await enrichDraftItems(pool, payload.items);
    if (!pool) return { ...payload, items };
    const reservations = await loadTickerReservationsByDraftIds(pool, items.map((item) => item.id));
    return {
      ...payload,
      items: items.map((item) => ({
        ...item,
        tickerReservation: reservations.get(String(item.id)) || null,
      })),
    };
  }

  if (payload.draft?.id) {
    const row = await loadDraftRowById(pool, payload.draft.id);
    const tickerReservation = pool
      ? await loadTickerReservationByDraft(pool, payload.draft.id, { includeReleased: true })
      : null;
    return {
      ...payload,
      draft: {
        ...augmentDraftLifecycle(payload.draft, row),
        tickerReservation,
      },
    };
  }

  return payload;
}

function belongsInDraftSection(item, nowMs = Date.now()) {
  const status = String(item?.status || "draft");
  if (status === "deployed") return false;
  if (status !== "scheduled") return true;

  // Live DB still has armed/public scheduled drafts whose scheduled_launch_at was
  // never backfilled (null). Hiding those made postgrad look like it "missed"
  // drafts that live still shows. Only drop scheduled rows once we know the
  // launch timestamp and it is already in the past.
  const launchMs = item?.scheduledLaunchAt ? Date.parse(String(item.scheduledLaunchAt)) : NaN;
  if (!Number.isFinite(launchMs)) return true;
  return launchMs > nowMs;
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
    const items = await listPublicCampaignLifecycleDrafts(pool, { chainId, limit, includeLaunched: true });
    return json(res, 200, { items });
  }

  const pool = await getLifecyclePool();
  await reconcileScheduledDraftLifecycle(pool);

  return runJsonTransform(base.drafts, req, res, async (payload) => {
    const enriched = await enrichPayload(payload, pool);
    if (!Array.isArray(enriched?.items)) return enriched;

    const nowMs = Date.now();
    const draftItems = enriched.items.filter((item) => belongsInDraftSection(item, nowMs));
    const isPublicList = req.method === "GET" && !String(query.owner || "").trim();
    if (!isPublicList || !pool) return { ...enriched, items: draftItems };

    const chainId = query.chainId ? Number(query.chainId) : null;
    const limit = Math.max(1, Math.min(500, Number(query.limit || 50) || 50));
    const lifecycleItems = await listPublicCampaignLifecycleDrafts(pool, {
      chainId,
      limit,
      includeLaunched: false,
    });

    return {
      ...enriched,
      items: mergeDraftItems(draftItems, lifecycleItems)
        .filter((item) => belongsInDraftSection(item, nowMs))
        .slice(0, limit),
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
