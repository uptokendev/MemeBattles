import Ably from "ably";
import { ENV } from "./env.js";

export const ablyRest = new Ably.Rest({ key: ENV.ABLY_API_KEY });

export function tokenChannel(chainId: number, campaignAddress: string) {
  return `token:${chainId}:${campaignAddress.toLowerCase()}`;
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