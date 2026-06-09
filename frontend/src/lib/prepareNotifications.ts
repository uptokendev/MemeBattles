import { buildRealtimeApiUrl } from "@/lib/realtimeApi";
import type { DraftNotification } from "@/lib/draftPromotion";

async function parseJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((json as any)?.error || (json as any)?.message || `Request failed (${res.status})`));
  }
  return json as any;
}

import { normalizeAddress as centralNormalize } from "./address";

function normalizeWallet(value?: string | null, chainId?: number) {
  return centralNormalize(value, chainId);
}

export async function fetchPrepareNotifications(walletAddress?: string | null, limit = 20): Promise<DraftNotification[]> {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return [];

  const qs = new URLSearchParams({ wallet, limit: String(limit) });
  const res = await fetch(buildRealtimeApiUrl(`/api/prepare-notifications?${qs.toString()}`), {
    cache: "no-store",
  });
  const json = await parseJson(res);
  return Array.isArray(json.items) ? (json.items as DraftNotification[]) : [];
}

export async function markPrepareNotificationRead(walletAddress: string, id: string) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet || !id) return;

  const res = await fetch(buildRealtimeApiUrl("/api/prepare-notifications"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, id }),
  });

  await parseJson(res);
}

export async function markAllPrepareNotificationsRead(walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  if (!wallet) return;

  const res = await fetch(buildRealtimeApiUrl("/api/prepare-notifications"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet, markAllRead: true }),
  });

  await parseJson(res);
}
