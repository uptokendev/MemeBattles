import Ably from "ably";
import { ENV } from "./env.js";

export const ablyRest = new Ably.Rest({ key: ENV.ABLY_API_KEY });

export function tokenChannel(chainId: number, campaignAddress: string) {
  return `token:${chainId}:${campaignAddress.toLowerCase()}`;
}

export function leagueChannel(chainId: number) {
  return `league:${chainId}`;
}

export async function publishTrade(chainId: number, campaign: string, msg: any) {
  const ch = ablyRest.channels.get(tokenChannel(chainId, campaign));
  await ch.publish("trade", msg);
}

export async function publishCandle(chainId: number, campaign: string, msg: any) {
  const ch = ablyRest.channels.get(tokenChannel(chainId, campaign));
  await ch.publish("candle_upsert", msg);
}

export async function publishStats(chainId: number, campaign: string, msg: any) {
  const ch = ablyRest.channels.get(tokenChannel(chainId, campaign));
  await ch.publish("stats_patch", msg);
}

export async function publishLeague(chainId: number, event: string, msg: any) {
  const ch = ablyRest.channels.get(leagueChannel(chainId));
  await ch.publish(event, msg);
}

export async function publishUserRankUpdated(
  chainId: number,
  msg: {
    address: string;
    oldRank: string | null;
    newRank: string;
    rankPoints?: number | string | null;
    updatedAt?: string | null;
  }
) {
  await publishLeague(chainId, "user_rank_updated", {
    address: String(msg.address || "").trim().toLowerCase(),
    oldRank: msg.oldRank ?? null,
    newRank: msg.newRank,
    rankPoints: msg.rankPoints ?? null,
    updatedAt: msg.updatedAt ?? new Date().toISOString(),
  });
}
