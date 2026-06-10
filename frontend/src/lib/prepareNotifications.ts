import { apiFetch } from "@/lib/apiBase";
import type { DraftNotification } from "@/lib/draftPromotion";

import { normalizeAddress as centralNormalize } from "./address";

function normalizeWallet(value?: string | null, chainId?: number) {
  return centralNormalize(value, chainId);
}

export async function fetchPrepareNotifications(walletAddress?: string | null, limit = 20): Promise<DraftNotification[]> {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return [];

  const qs = new URLSearchParams({ wallet, limit: String(limit) });
  const json = await apiFetch(`/api/prepare-notifications?${qs.toString()}`, { cache: "no-store" }).then(r => r.json());
  return Array.isArray(json?.items) ? (json.items as DraftNotification[]) : [];
}

export async function markPrepareNotificationRead(walletAddress: string, id: string) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet || !id) return;

  await apiFetch("/api/prepare-notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, id }),
  });
}

export async function markAllPrepareNotificationsRead(walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return;

  await apiFetch("/api/prepare-notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, markAllRead: true }),
  });
}
