import { ethers } from "ethers";
import { ablyRest, tokenChannel } from "./ably.js";
import { LAUNCH_CAMPAIGN_ABI } from "./abis.js";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { reconcileGraduationHandoff } from "./marketContinuity.js";

type ChainConfig = {
  chainId: number;
  rpcUrls: string[];
};

type Candidate = {
  campaignAddress: string;
  createdBlock: number;
  graduatedBlock: number | null;
  marketStage: string;
};

const LOOP_SYMBOL = Symbol.for("memewarzone.wtrGraduationReconcilerStarted");
const globalState = globalThis as any;

function parseRpcList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function chainConfigs(): ChainConfig[] {
  const result: ChainConfig[] = [];
  const testnet = parseRpcList(ENV.BSC_RPC_HTTP_97);
  const mainnet = parseRpcList(ENV.BSC_RPC_HTTP_56);
  if (testnet.length) result.push({ chainId: 97, rpcUrls: testnet });
  if (mainnet.length) result.push({ chainId: 56, rpcUrls: mainnet });
  return result;
}

function providerFor(config: ChainConfig): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.rpcUrls[0], config.chainId, {
    batchMaxCount: 1,
    batchStallTime: 0,
  });
}

async function listCandidates(chainId: number): Promise<Candidate[]> {
  const result = await pool.query(
    `select
       c.campaign_address,
       coalesce(c.created_block,0) as created_block,
       c.graduated_block,
       coalesce(cms.market_stage,c.market_stage,'BONDING') as market_stage
     from public.campaigns c
     left join public.campaign_market_state cms
       on cms.chain_id=c.chain_id and cms.campaign_address=c.campaign_address
     where c.chain_id=$1
       and c.support_enabled=true
       and c.indexing_enabled=true
       and coalesce(cms.market_stage,c.market_stage,'BONDING') in ('BONDING','GRADUATING','TOPAZ_PENDING','TOPAZ_DEGRADED')
     order by
       case when c.graduated_block is not null then 0 else 1 end,
       coalesce(c.graduated_at_chain,c.created_at_chain,c.updated_at) desc nulls last
     limit $2`,
    [chainId, Math.max(1, ENV.GRADUATION_HANDOFF_MAX_CAMPAIGNS)],
  );

  return result.rows.map((row: any) => ({
    campaignAddress: String(row.campaign_address).toLowerCase(),
    createdBlock: Number(row.created_block || 0),
    graduatedBlock: row.graduated_block == null ? null : Number(row.graduated_block),
    marketStage: String(row.market_stage || "BONDING"),
  }));
}

async function getLogsAdaptive(
  provider: ethers.JsonRpcProvider,
  address: string,
  topic0: string,
  fromBlock: number,
  toBlock: number,
): Promise<ethers.Log[]> {
  if (fromBlock > toBlock) return [];
  const span = toBlock - fromBlock + 1;
  try {
    return await provider.getLogs({ address, topics: [topic0], fromBlock, toBlock });
  } catch (error) {
    if (span <= Math.max(1, ENV.MIN_LOG_CHUNK_SIZE)) throw error;
    const mid = Math.floor((fromBlock + toBlock) / 2);
    const left = await getLogsAdaptive(provider, address, topic0, fromBlock, mid);
    const right = await getLogsAdaptive(provider, address, topic0, mid + 1, toBlock);
    return left.concat(right);
  }
}

async function findGraduationLog(
  provider: ethers.JsonRpcProvider,
  candidate: Candidate,
  finalizedHead: number,
): Promise<ethers.Log | null> {
  const iface = new ethers.Interface(LAUNCH_CAMPAIGN_ABI);
  const event = iface.getEvent("CampaignFinalized");
  if (!event) throw new Error("CampaignFinalized event is missing from LAUNCH_CAMPAIGN_ABI");

  if (candidate.graduatedBlock != null) {
    const from = Math.max(0, candidate.graduatedBlock - 1);
    const to = Math.min(finalizedHead, candidate.graduatedBlock + 1);
    const exact = await getLogsAdaptive(provider, candidate.campaignAddress, event.topicHash, from, to);
    return exact.sort((a, b) => b.blockNumber - a.blockNumber || Number(b.index ?? 0) - Number(a.index ?? 0))[0] ?? null;
  }

  const fallbackStart = Math.max(0, finalizedHead - ENV.FACTORY_LOOKBACK_BLOCKS);
  const fromBlock = candidate.createdBlock > 0 ? candidate.createdBlock : fallbackStart;
  const step = Math.max(250, ENV.LOG_CHUNK_SIZE);
  let latest: ethers.Log | null = null;

  for (let start = fromBlock; start <= finalizedHead; start += step) {
    const end = Math.min(finalizedHead, start + step - 1);
    const logs = await getLogsAdaptive(provider, candidate.campaignAddress, event.topicHash, start, end);
    if (logs.length) latest = logs[logs.length - 1];
  }

  return latest;
}

async function publishStageChange(input: {
  chainId: number;
  campaignAddress: string;
  from: string;
  to: string;
  blockNumber: number;
  txHash: string;
  reason?: string | null;
}) {
  if (input.from === input.to) return;
  try {
    const channel = ablyRest.channels.get(tokenChannel(input.chainId, input.campaignAddress));
    await channel.publish("market_stage_changed", {
      eventId: `${input.chainId}:${input.campaignAddress}:${input.blockNumber}:${input.to}`,
      chainId: input.chainId,
      campaignAddress: input.campaignAddress,
      from: input.from,
      to: input.to,
      marketStage: input.to,
      blockNumber: input.blockNumber,
      txHash: input.txHash,
      reason: input.reason ?? null,
    });
  } catch (error: any) {
    console.warn("[wtr] market stage realtime publish failed", error?.message || String(error));
  }
}

async function noteMissingGraduationLog(chainId: number, candidate: Candidate) {
  await pool.query(
    `insert into public.campaign_market_state(
       chain_id,campaign_address,token_address,factory_address,market_stage,
       pool_verified,indexing_enabled,last_error,created_at,updated_at
     )
     select
       c.chain_id,c.campaign_address,coalesce(c.token_address,''),c.factory_address,'TOPAZ_PENDING',
       false,true,'Campaign is launched on-chain but the finalized graduation log has not been recovered yet.',now(),now()
     from public.campaigns c
     where c.chain_id=$1 and c.campaign_address=$2
     on conflict (chain_id,campaign_address) do update set
       market_stage='TOPAZ_PENDING',
       pool_verified=false,
       indexing_enabled=true,
       last_error=excluded.last_error,
       updated_at=now()`,
    [chainId, candidate.campaignAddress],
  );

  await pool.query(
    `update public.campaigns
        set bonding_active=false,
            support_enabled=true,
            indexing_enabled=true,
            market_stage='TOPAZ_PENDING',
            updated_at=now()
      where chain_id=$1 and campaign_address=$2`,
    [chainId, candidate.campaignAddress],
  );
}

async function reconcileCandidate(
  provider: ethers.JsonRpcProvider,
  chainId: number,
  candidate: Candidate,
  finalizedHead: number,
) {
  if (!ethers.isAddress(candidate.campaignAddress)) return;

  const campaign = new ethers.Contract(candidate.campaignAddress, LAUNCH_CAMPAIGN_ABI, provider) as any;
  let launched = false;
  try {
    launched = Boolean(await campaign.launched());
  } catch (error: any) {
    console.warn("[wtr] launched() read failed", {
      chainId,
      campaign: candidate.campaignAddress,
      error: error?.shortMessage || error?.message || String(error),
    });
    return;
  }
  if (!launched) return;

  const log = await findGraduationLog(provider, candidate, finalizedHead);
  if (!log) {
    await noteMissingGraduationLog(chainId, candidate);
    return;
  }

  const iface = new ethers.Interface(LAUNCH_CAMPAIGN_ABI);
  const parsed = iface.parseLog(log);
  if (!parsed || parsed.name !== "CampaignFinalized") {
    throw new Error(`Unable to decode CampaignFinalized for ${candidate.campaignAddress}`);
  }

  const block = await provider.getBlock(log.blockNumber);
  const blockTime = new Date(Number(block?.timestamp || 0) * 1000);
  const result = await reconcileGraduationHandoff({
    provider,
    chainId,
    campaignAddress: candidate.campaignAddress,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    blockTime,
    args: parsed.args,
  });

  await publishStageChange({
    chainId,
    campaignAddress: candidate.campaignAddress,
    from: candidate.marketStage,
    to: result.marketStage,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    reason: result.reason,
  });

  console.log("[wtr] graduation reconciled", result);
}

export async function runGraduationReconcilerOnce() {
  if (!ENV.ENABLE_GRADUATION_HANDOFF_RECONCILER) {
    return { enabled: false, scanned: 0, reconciled: 0, errors: 0 };
  }

  let scanned = 0;
  let reconciled = 0;
  let errors = 0;

  for (const config of chainConfigs()) {
    const provider = providerFor(config);
    try {
      const head = await provider.getBlockNumber();
      const finalizedHead = Math.max(0, head - Math.max(0, ENV.CONFIRMATIONS));
      const candidates = await listCandidates(config.chainId);
      for (const candidate of candidates) {
        scanned += 1;
        try {
          const before = candidate.marketStage;
          await reconcileCandidate(provider, config.chainId, candidate, finalizedHead);
          if (before !== "TOPAZ_ACTIVE") reconciled += 1;
        } catch (error: any) {
          errors += 1;
          console.error("[wtr] graduation reconciliation failed", {
            chainId: config.chainId,
            campaign: candidate.campaignAddress,
            error: error?.shortMessage || error?.message || String(error),
          });
        }
      }
    } finally {
      provider.destroy();
    }
  }

  return { enabled: true, scanned, reconciled, errors };
}

export function startGraduationReconcilerLoop() {
  if (!ENV.ENABLE_GRADUATION_HANDOFF_RECONCILER || globalState[LOOP_SYMBOL]) return;
  globalState[LOOP_SYMBOL] = true;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runGraduationReconcilerOnce();
      if (result.scanned || result.errors) console.log("[wtr] graduation reconciliation pass", result);
    } catch (error: any) {
      console.error("[wtr] graduation reconciler loop failed", error?.message || String(error));
    } finally {
      running = false;
    }
  };

  const initial = setTimeout(() => void tick(), 2_000);
  initial.unref?.();
  const timer = setInterval(() => void tick(), Math.max(5_000, ENV.GRADUATION_HANDOFF_INTERVAL_MS));
  timer.unref?.();
}
