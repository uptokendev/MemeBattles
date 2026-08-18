import type { PoolClient, QueryResult } from "pg";
import { pool } from "../db.js";
import { getEpochById, type RewardEpochRecord } from "./epochs.js";
import type { EligibilityReasonCode } from "./reasonCodes.js";

const SOLANA_CHAIN_IDS = new Set([101, 102]);
const LAMPORTS_PER_SOL = 1_000_000_000n;
const DEFAULT_TRADER_MIN_VOLUME = 25n * 10_000_000n; // 0.25 SOL
const TRADER_MAX_COUNTED_VOLUME = 15n * LAMPORTS_PER_SOL;
const DEFAULT_CREATOR_MIN_BONDING_VOLUME = 3n * LAMPORTS_PER_SOL;
const CREATOR_MAX_COUNTED_VOLUME = 25n * LAMPORTS_PER_SOL;
const DEFAULT_CREATOR_MAX_ELIGIBLE_CAMPAIGNS = 2;
const DEFAULT_CREATOR_MIN_UNIQUE_NON_LINKED_BUYERS = 10;
const DEFAULT_TRADER_MIN_TRADE_COUNT = 3;
const DEFAULT_TRADER_MIN_ACTIVE_DAYS = 2;

export type SolanaSquadEligibilityResult = {
  epoch: RewardEpochRecord;
  memberCount: number;
  eligibleCount: number;
  reviewCount: number;
  hardFlaggedCount: number;
};

type DbLike = {
  query: (queryTextOrConfig: string | { text: string; values?: any[]; simple?: boolean }, values?: any[]) => Promise<QueryResult<any>>;
};

type Member = {
  walletAddress: string;
  recruiterId: number;
  recruiterStatus: string;
  joinedAt: string;
  leftAt: string | null;
};

type TradeMetrics = {
  volume: bigint;
  tradeCount: number;
  activeDays: number;
  ownCampaignTradeCount: number;
};

type CreatorMetrics = {
  totalBuyVolume: bigint;
  countedQualifiedVolume: bigint;
  qualifyingCampaignCount: number;
  maxUniqueNonLinkedBuyers: number;
};

type OpenFlag = {
  flagType: EligibilityReasonCode;
  severity: "hard" | "review";
};

type EligibilityConfig = {
  certificationMode: boolean;
  activityChainId: number;
  traderMinVolume: bigint;
  traderMinTradeCount: number;
  traderMinActiveDays: number;
  creatorMinBondingVolume: bigint;
  creatorMinUniqueNonLinkedBuyers: number;
  creatorMaxEligibleCampaigns: number;
};

type AutomaticFlagInput = {
  walletAddress: string;
  epochId: number;
  flagType: EligibilityReasonCode;
  severity: "hard" | "review";
  details: Record<string, unknown>;
  detector: string;
};

type EligibilityRowInput = {
  epochId: number;
  walletAddress: string;
  isEligible: boolean;
  score: string;
  reasonCodes: EligibilityReasonCode[];
  metadata: Record<string, unknown>;
};

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asBigInt(value: unknown): bigint {
  const s = String(value ?? "0").trim();
  return s ? BigInt(s) : 0n;
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function envBool(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? (fallback ? "true" : "false")).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = String(process.env[name] ?? fallback).trim();
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function envPositiveBigInt(name: string, fallback: bigint): bigint {
  const raw = String(process.env[name] ?? fallback.toString()).trim();
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = BigInt(raw);
  if (value <= 0n) throw new Error(`${name} must be greater than zero`);
  return value;
}

function resolveEligibilityConfig(epoch: RewardEpochRecord): EligibilityConfig {
  const requestedCertificationMode = envBool("SOLANA_INCENTIVE_CERTIFICATION_MODE", false);
  if (requestedCertificationMode && epoch.chainId !== 102) {
    throw new Error("SOLANA_INCENTIVE_CERTIFICATION_MODE is allowed only for reward chain 102");
  }

  const certificationMode = requestedCertificationMode && epoch.chainId === 102;
  const activityChainId = certificationMode
    ? envPositiveInt("SOLANA_SQUAD_ACTIVITY_CHAIN_ID", 101)
    : epoch.chainId;
  if (!SOLANA_CHAIN_IDS.has(activityChainId)) {
    throw new Error("SOLANA_SQUAD_ACTIVITY_CHAIN_ID must be 101 or 102");
  }

  return {
    certificationMode,
    activityChainId,
    traderMinVolume: certificationMode
      ? envPositiveBigInt("SOLANA_SQUAD_TRADER_MIN_VOLUME_LAMPORTS", DEFAULT_TRADER_MIN_VOLUME)
      : DEFAULT_TRADER_MIN_VOLUME,
    traderMinTradeCount: certificationMode
      ? envPositiveInt("SOLANA_SQUAD_TRADER_MIN_TRADES", DEFAULT_TRADER_MIN_TRADE_COUNT)
      : DEFAULT_TRADER_MIN_TRADE_COUNT,
    traderMinActiveDays: certificationMode
      ? envPositiveInt("SOLANA_SQUAD_TRADER_MIN_ACTIVE_DAYS", DEFAULT_TRADER_MIN_ACTIVE_DAYS)
      : DEFAULT_TRADER_MIN_ACTIVE_DAYS,
    creatorMinBondingVolume: certificationMode
      ? envPositiveBigInt("SOLANA_SQUAD_CREATOR_MIN_VOLUME_LAMPORTS", DEFAULT_CREATOR_MIN_BONDING_VOLUME)
      : DEFAULT_CREATOR_MIN_BONDING_VOLUME,
    creatorMinUniqueNonLinkedBuyers: certificationMode
      ? envPositiveInt("SOLANA_SQUAD_CREATOR_MIN_UNIQUE_BUYERS", DEFAULT_CREATOR_MIN_UNIQUE_NON_LINKED_BUYERS)
      : DEFAULT_CREATOR_MIN_UNIQUE_NON_LINKED_BUYERS,
    creatorMaxEligibleCampaigns: certificationMode
      ? envPositiveInt("SOLANA_SQUAD_CREATOR_MAX_CAMPAIGNS", DEFAULT_CREATOR_MAX_ELIGIBLE_CAMPAIGNS)
      : DEFAULT_CREATOR_MAX_ELIGIBLE_CAMPAIGNS,
  };
}

async function withTransaction<T>(fn: (db: PoolClient & DbLike) => Promise<T>): Promise<T> {
  const client = (await pool.connect()) as PoolClient & DbLike & { query: any };
  const originalQuery = client.query.bind(client);
  client.query = (...args: any[]) => {
    if (typeof args[0] === "string") {
      return originalQuery({ text: args[0], values: Array.isArray(args[1]) ? args[1] : undefined, simple: true });
    }
    return originalQuery({ ...args[0], simple: true });
  };
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  } finally {
    client.release();
  }
}

async function requireSolanaWeeklyEpoch(db: DbLike, epochId: number): Promise<RewardEpochRecord> {
  const epoch = await getEpochById(epochId, db);
  if (!epoch) throw new Error(`Reward epoch ${epochId} not found`);
  if (!SOLANA_CHAIN_IDS.has(epoch.chainId)) throw new Error(`Reward epoch ${epochId} is not Solana`);
  if (epoch.epochType !== "weekly") throw new Error(`Reward epoch ${epochId} is not weekly`);
  return epoch;
}

async function loadMembers(db: DbLike, epoch: RewardEpochRecord): Promise<Member[]> {
  const r = await db.query(
    `select distinct on (m.wallet_address)
            m.wallet_address,
            m.recruiter_id,
            r.status as recruiter_status,
            m.joined_at,
            m.left_at
       from public.wallet_squad_memberships m
       join public.recruiters r on r.id = m.recruiter_id
      where m.joined_at < $2
        and (m.left_at is null or m.left_at >= $1)
      order by m.wallet_address, m.joined_at desc, m.id desc`,
    [epoch.startAt, epoch.endAt],
  );
  return r.rows.map((row: any) => ({
    walletAddress: String(row.wallet_address),
    recruiterId: asNumber(row.recruiter_id),
    recruiterStatus: String(row.recruiter_status || ""),
    joinedAt: new Date(row.joined_at).toISOString(),
    leftAt: row.left_at ? new Date(row.left_at).toISOString() : null,
  }));
}

async function loadTradeMetrics(db: DbLike, epoch: RewardEpochRecord, config: EligibilityConfig): Promise<Map<string, TradeMetrics>> {
  const r = await db.query(
    `select t.wallet as wallet_address,
            coalesce(sum(t.bnb_amount_raw::numeric), 0)::numeric(78,0) as volume_raw,
            count(*)::int as trade_count,
            count(distinct date_trunc('day', t.block_time at time zone 'utc'))::int as active_days,
            count(*) filter (where t.wallet = c.creator_address)::int as own_campaign_trade_count
       from public.curve_trades t
       left join public.campaigns c
         on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
      where t.chain_id=$1
        and t.block_time >= $2
        and t.block_time < $3
      group by t.wallet`,
    [config.activityChainId, epoch.startAt, epoch.endAt],
  );
  const map = new Map<string, TradeMetrics>();
  for (const row of r.rows) {
    map.set(String(row.wallet_address), {
      volume: asBigInt(row.volume_raw),
      tradeCount: asNumber(row.trade_count),
      activeDays: asNumber(row.active_days),
      ownCampaignTradeCount: asNumber(row.own_campaign_trade_count),
    });
  }
  return map;
}

async function loadCreatorMetrics(db: DbLike, epoch: RewardEpochRecord, config: EligibilityConfig): Promise<Map<string, CreatorMetrics>> {
  const r = await db.query(
    `with per_campaign as (
       select c.creator_address as wallet_address,
              c.campaign_address,
              coalesce(sum(case when t.side='buy' then t.bnb_amount_raw::numeric else 0 end),0)::numeric(78,0) as buy_volume_raw,
              count(distinct case
                when t.side='buy'
                 and t.wallet <> c.creator_address
                 and not exists (
                   select 1
                     from public.wallet_recruiter_links l
                    where l.wallet_address=t.wallet
                      and l.linked_at <= t.block_time
                      and (l.detached_at is null or l.detached_at > t.block_time)
                 )
                then t.wallet end)::int as unique_non_linked_buyers
         from public.campaigns c
         left join public.curve_trades t
           on t.chain_id=c.chain_id
          and t.campaign_address=c.campaign_address
          and t.block_time >= $2
          and t.block_time < $3
        where c.chain_id=$1
          and c.creator_address is not null
        group by c.creator_address, c.campaign_address
     ), ranked_qualified as (
       select *, row_number() over (
         partition by wallet_address
         order by buy_volume_raw desc, campaign_address asc
       ) as qualified_rank
       from per_campaign
       where buy_volume_raw >= $4::numeric
         and unique_non_linked_buyers >= $5
     )
     select pc.wallet_address,
            coalesce(sum(pc.buy_volume_raw),0)::numeric(78,0) as total_buy_volume_raw,
            count(*) filter (
              where pc.buy_volume_raw >= $4::numeric
                and pc.unique_non_linked_buyers >= $5
            )::int as qualifying_campaign_count,
            coalesce(max(pc.unique_non_linked_buyers),0)::int as max_unique_non_linked_buyers,
            coalesce(sum(case when rq.qualified_rank <= $6 then rq.buy_volume_raw else 0 end),0)::numeric(78,0) as qualified_top_two_raw
       from per_campaign pc
       left join ranked_qualified rq
         on rq.wallet_address=pc.wallet_address and rq.campaign_address=pc.campaign_address
      group by pc.wallet_address`,
    [
      config.activityChainId,
      epoch.startAt,
      epoch.endAt,
      config.creatorMinBondingVolume.toString(),
      config.creatorMinUniqueNonLinkedBuyers,
      config.creatorMaxEligibleCampaigns,
    ],
  );
  const map = new Map<string, CreatorMetrics>();
  for (const row of r.rows) {
    const qualified = asBigInt(row.qualified_top_two_raw);
    map.set(String(row.wallet_address), {
      totalBuyVolume: asBigInt(row.total_buy_volume_raw),
      countedQualifiedVolume: qualified > CREATOR_MAX_COUNTED_VOLUME ? CREATOR_MAX_COUNTED_VOLUME : qualified,
      qualifyingCampaignCount: asNumber(row.qualifying_campaign_count),
      maxUniqueNonLinkedBuyers: asNumber(row.max_unique_non_linked_buyers),
    });
  }
  return map;
}

async function upsertAutomaticFlags(db: DbLike, inputs: AutomaticFlagInput[]) {
  if (!inputs.length) return;
  await db.query(
    `with incoming as (
       select distinct
         item->>'walletAddress' as wallet_address,
         (item->>'epochId')::int as epoch_id,
         item->>'flagType' as flag_type,
         item->>'severity' as severity,
         coalesce(item->'details', '{}'::jsonb) as details_json,
         jsonb_build_object('detector', item->>'detector') as metadata
       from jsonb_array_elements($1::jsonb) item
     )
     insert into public.exclusion_flags(
       wallet_address, epoch_id, program, flag_type, severity, details_json, metadata, created_at, updated_at
     )
     select
       i.wallet_address,
       i.epoch_id,
       'squad',
       i.flag_type,
       i.severity,
       i.details_json,
       i.metadata,
       now(),
       now()
     from incoming i
     where not exists (
       select 1
         from public.exclusion_flags e
        where e.wallet_address=i.wallet_address
          and e.epoch_id=i.epoch_id
          and e.program='squad'
          and e.flag_type=i.flag_type
          and e.resolved_at is null
     )`,
    [JSON.stringify(inputs)],
  );
}

async function upsertEligibilityResults(db: DbLike, inputs: EligibilityRowInput[]) {
  if (!inputs.length) return;
  await db.query(
    `with incoming as (
       select
         (item->>'epochId')::int as epoch_id,
         item->>'walletAddress' as wallet_address,
         coalesce((item->>'isEligible')::boolean, false) as is_eligible,
         coalesce(item->>'score', '0') as score_raw,
         coalesce(item->'reasonCodes', '[]'::jsonb) as reason_codes_json,
         coalesce(item->'metadata', '{}'::jsonb) as metadata
       from jsonb_array_elements($1::jsonb) item
     )
     insert into public.eligibility_results(
       epoch_id, wallet_address, program, is_eligible, score, reason_codes, metadata, computed_at, created_at, updated_at
     )
     select
       i.epoch_id,
       i.wallet_address,
       'squad',
       i.is_eligible,
       i.score_raw::numeric,
       coalesce(array(select jsonb_array_elements_text(i.reason_codes_json)), ARRAY[]::text[]),
       i.metadata,
       now(),
       now(),
       now()
     from incoming i
     on conflict (epoch_id, wallet_address, program) do update set
       is_eligible=excluded.is_eligible,
       score=excluded.score,
       reason_codes=excluded.reason_codes,
       metadata=excluded.metadata,
       computed_at=now(),
       updated_at=now()`,
    [JSON.stringify(inputs)],
  );
}

async function syncAutomaticFlags(db: DbLike, epoch: RewardEpochRecord, config: EligibilityConfig) {
  const pendingFlags: AutomaticFlagInput[] = [];

  const self = await db.query(
    `select t.wallet as wallet_address, count(*)::int as matched_trade_count
       from public.curve_trades t
       join public.campaigns c on c.chain_id=t.chain_id and c.campaign_address=t.campaign_address
      where t.chain_id=$1 and t.block_time >= $2 and t.block_time < $3
        and t.wallet=c.creator_address
      group by t.wallet`,
    [config.activityChainId, epoch.startAt, epoch.endAt],
  );
  for (const row of self.rows) {
    const walletAddress = String(row.wallet_address);
    const matchedTradeCount = asNumber(row.matched_trade_count);
    pendingFlags.push({
      walletAddress,
      epochId: epoch.id,
      flagType: "SELF_TRADING",
      severity: "hard",
      details: { matchedTradeCount },
      detector: "solana_self_trading_v1",
    });
    pendingFlags.push({
      walletAddress,
      epochId: epoch.id,
      flagType: "CREATOR_FUNDED_FAKE_DEMAND",
      severity: "review",
      details: { matchedTradeCount },
      detector: "solana_creator_fake_demand_v1",
    });
  }

  const circular = await db.query(
    `select t.wallet as wallet_address, t.campaign_address
       from public.curve_trades t
      where t.chain_id=$1 and t.block_time >= $2 and t.block_time < $3
      group by t.wallet, t.campaign_address
     having count(*) filter (where t.side='buy') > 0
        and count(*) filter (where t.side='sell') > 0`,
    [config.activityChainId, epoch.startAt, epoch.endAt],
  );
  const circularByWallet = new Map<string, string[]>();
  for (const row of circular.rows) {
    const wallet = String(row.wallet_address);
    const items = circularByWallet.get(wallet) ?? [];
    items.push(String(row.campaign_address));
    circularByWallet.set(wallet, items);
  }
  for (const [walletAddress, campaignAddresses] of circularByWallet) {
    pendingFlags.push({
      walletAddress,
      epochId: epoch.id,
      flagType: "CIRCULAR_TRADING",
      severity: "review",
      details: { campaignAddresses: uniq(campaignAddresses) },
      detector: "solana_circular_trading_v1",
    });
  }

  const split = await db.query(
    `with per_wallet as (
       select l.recruiter_id, l.wallet_address,
              coalesce(sum(t.bnb_amount_raw::numeric),0)::numeric(78,0) as volume_raw
         from public.wallet_recruiter_links l
         join public.curve_trades t
           on t.wallet=l.wallet_address
          and t.chain_id=$1
          and t.block_time >= $2 and t.block_time < $3
        where l.linked_at < $3
          and (l.detached_at is null or l.detached_at >= $2)
        group by l.recruiter_id, l.wallet_address
     ), flagged as (
       select recruiter_id from per_wallet
        where volume_raw > 0 and volume_raw < $4::numeric
        group by recruiter_id having count(*) >= 4
     )
     select p.* from per_wallet p join flagged f using (recruiter_id)
      where p.volume_raw > 0 and p.volume_raw < $4::numeric`,
    [config.activityChainId, epoch.startAt, epoch.endAt, config.traderMinVolume.toString()],
  );
  for (const row of split.rows) {
    pendingFlags.push({
      walletAddress: String(row.wallet_address),
      epochId: epoch.id,
      flagType: "WALLET_SPLITTING",
      severity: "review",
      details: { recruiterId: asNumber(row.recruiter_id), volumeRaw: String(row.volume_raw) },
      detector: "solana_wallet_splitting_v1",
    });
  }

  await upsertAutomaticFlags(db, pendingFlags);
}

async function loadOpenFlags(db: DbLike, epochId: number): Promise<Map<string, OpenFlag[]>> {
  const r = await db.query(
    `select wallet_address, flag_type, severity
       from public.exclusion_flags
      where resolved_at is null
        and (epoch_id is null or epoch_id=$1)
        and (program is null or program='squad')`,
    [epochId],
  );
  const map = new Map<string, OpenFlag[]>();
  for (const row of r.rows) {
    const wallet = String(row.wallet_address);
    const items = map.get(wallet) ?? [];
    items.push({
      flagType: String(row.flag_type) as EligibilityReasonCode,
      severity: String(row.severity) as OpenFlag["severity"],
    });
    map.set(wallet, items);
  }
  return map;
}

function evaluateMember(
  member: Member,
  trade: TradeMetrics,
  creator: CreatorMetrics,
  flags: OpenFlag[],
  config: EligibilityConfig,
) {
  const generalReasons: EligibilityReasonCode[] = [];
  const traderReasons: EligibilityReasonCode[] = [];
  const creatorReasons: EligibilityReasonCode[] = [];

  if (member.recruiterStatus !== "active") generalReasons.push("RECRUITER_CLOSED");
  for (const flag of flags) {
    generalReasons.push(flag.flagType);
    if (flag.severity === "review") generalReasons.push("REVIEW_REQUIRED");
  }

  if (trade.volume < config.traderMinVolume) traderReasons.push("TRADER_VOLUME_BELOW_MIN");
  if (trade.tradeCount < config.traderMinTradeCount) traderReasons.push("TRADER_TRADE_COUNT_BELOW_MIN");
  if (trade.activeDays < config.traderMinActiveDays) traderReasons.push("TRADER_ACTIVE_DAYS_BELOW_MIN");
  if (trade.ownCampaignTradeCount > 0) traderReasons.push("OWN_CAMPAIGN_TRADE_EXCLUDED");
  const traderEligible = traderReasons.length === 0;
  const traderScore = traderEligible ? (trade.volume > TRADER_MAX_COUNTED_VOLUME ? TRADER_MAX_COUNTED_VOLUME : trade.volume) : 0n;

  if (creator.qualifyingCampaignCount < 1 || creator.totalBuyVolume < config.creatorMinBondingVolume) {
    creatorReasons.push("CREATOR_BONDING_VOLUME_BELOW_MIN");
  }
  if (creator.maxUniqueNonLinkedBuyers < config.creatorMinUniqueNonLinkedBuyers) {
    creatorReasons.push("CREATOR_UNIQUE_BUYERS_BELOW_MIN");
  }
  if (creator.qualifyingCampaignCount > config.creatorMaxEligibleCampaigns) {
    creatorReasons.push("CREATOR_CAMPAIGN_CAP_EXCEEDED");
  }
  const creatorEligible = creator.qualifyingCampaignCount > 0 && creator.countedQualifiedVolume > 0n;
  const creatorScore = creatorEligible ? creator.countedQualifiedVolume : 0n;

  const componentEligible = traderEligible || creatorEligible;
  const blockingReasons = uniq(generalReasons);
  const isEligible = componentEligible && blockingReasons.length === 0;
  const topLevelReasons = isEligible
    ? []
    : uniq([...blockingReasons, ...(componentEligible ? [] : [...traderReasons, ...creatorReasons])]);

  return {
    isEligible,
    score: isEligible ? traderScore + creatorScore : 0n,
    reasonCodes: topLevelReasons,
    metadata: {
      chainNativeUnit: "lamports",
      activityChainId: config.activityChainId,
      certificationMode: config.certificationMode,
      recruiterId: member.recruiterId,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt,
      traderEligible,
      creatorEligible,
      traderReasonCodes: uniq(traderReasons),
      creatorReasonCodes: uniq(creatorReasons),
      traderMinVolumeRaw: config.traderMinVolume.toString(),
      traderMinTradeCount: config.traderMinTradeCount,
      traderMinActiveDays: config.traderMinActiveDays,
      creatorMinBondingVolumeRaw: config.creatorMinBondingVolume.toString(),
      creatorMinUniqueNonLinkedBuyers: config.creatorMinUniqueNonLinkedBuyers,
      creatorMaxEligibleCampaigns: config.creatorMaxEligibleCampaigns,
      tradeVolumeRaw: trade.volume.toString(),
      traderScoreRaw: traderScore.toString(),
      tradeCount: trade.tradeCount,
      activeDays: trade.activeDays,
      ownCampaignTradeCount: trade.ownCampaignTradeCount,
      creatorTotalBuyVolumeRaw: creator.totalBuyVolume.toString(),
      creatorCountedQualifiedVolumeRaw: creator.countedQualifiedVolume.toString(),
      qualifyingCampaignCount: creator.qualifyingCampaignCount,
      maxUniqueNonLinkedBuyers: creator.maxUniqueNonLinkedBuyers,
      creatorScoreRaw: creatorScore.toString(),
      combinedScoreRaw: (traderScore + creatorScore).toString(),
    },
  };
}

export async function processSolanaSquadEligibilityForEpoch(epochId: number): Promise<SolanaSquadEligibilityResult> {
  return withTransaction(async (db) => {
    await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`mwz:solana:squad:eligibility:${epochId}`]);
    const epoch = await requireSolanaWeeklyEpoch(db, epochId);
    const config = resolveEligibilityConfig(epoch);

    console.log("[solana-squad-eligibility] start", {
      epochId,
      rewardChainId: epoch.chainId,
      activityChainId: config.activityChainId,
      certificationMode: config.certificationMode,
    });

    const members = await loadMembers(db, epoch);
    const [trades, creators] = await Promise.all([
      loadTradeMetrics(db, epoch, config),
      loadCreatorMetrics(db, epoch, config),
    ]);

    console.log("[solana-squad-eligibility] loaded activity", {
      memberCount: members.length,
      traderWallets: trades.size,
      creatorWallets: creators.size,
    });

    await syncAutomaticFlags(db, epoch, config);
    const flags = await loadOpenFlags(db, epoch.id);

    console.log("[solana-squad-eligibility] synced flags", {
      flaggedWalletCount: flags.size,
    });

    let eligibleCount = 0;
    let reviewCount = 0;
    let hardFlaggedCount = 0;
    const eligibilityRows: EligibilityRowInput[] = [];

    for (const member of members) {
      const memberFlags = flags.get(member.walletAddress) ?? [];
      if (memberFlags.some((flag) => flag.severity === "review")) reviewCount += 1;
      if (memberFlags.some((flag) => flag.severity === "hard")) hardFlaggedCount += 1;
      const result = evaluateMember(
        member,
        trades.get(member.walletAddress) ?? { volume: 0n, tradeCount: 0, activeDays: 0, ownCampaignTradeCount: 0 },
        creators.get(member.walletAddress) ?? {
          totalBuyVolume: 0n,
          countedQualifiedVolume: 0n,
          qualifyingCampaignCount: 0,
          maxUniqueNonLinkedBuyers: 0,
        },
        memberFlags,
        config,
      );

      eligibilityRows.push({
        epochId: epoch.id,
        walletAddress: member.walletAddress,
        isEligible: result.isEligible,
        score: result.score.toString(),
        reasonCodes: result.reasonCodes,
        metadata: { ...result.metadata, rewardChainId: epoch.chainId },
      });
      if (result.isEligible) eligibleCount += 1;
    }

    await upsertEligibilityResults(db, eligibilityRows);

    console.log("[solana-squad-eligibility] wrote eligibility rows", {
      rowCount: eligibilityRows.length,
      eligibleCount,
      reviewCount,
      hardFlaggedCount,
    });

    return { epoch, memberCount: members.length, eligibleCount, reviewCount, hardFlaggedCount };
  });
}
