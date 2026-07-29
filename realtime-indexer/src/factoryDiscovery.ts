import { ethers } from "ethers";
import { pool } from "./db.js";
import { ENV } from "./env.js";
import { LAUNCH_FACTORY_ABI } from "./abis.js";
import { buildFactoryInventory, type SupportedFactory } from "./factoryInventory.js";

const FACTORY_IFACE = new ethers.Interface(LAUNCH_FACTORY_ABI);
const CAMPAIGN_CREATED = FACTORY_IFACE.getEvent("CampaignCreated");
if (!CAMPAIGN_CREATED) throw new Error("CampaignCreated missing from LAUNCH_FACTORY_ABI");

function parseRpcList(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inventories(): SupportedFactory[] {
  return [
    ...buildFactoryInventory({
      chainId: 97,
      rpcHttp: ENV.BSC_RPC_HTTP_97,
      activeFactoryAddress: ENV.FACTORY_ADDRESS_97,
      activeFactoryStartBlock: ENV.FACTORY_START_BLOCK_97,
      supportedFactoryAddresses: ENV.SUPPORTED_FACTORY_ADDRESSES_97,
      supportedFactoryStartBlocks: ENV.SUPPORTED_FACTORY_START_BLOCKS_97,
    }),
    ...(ENV.BSC_RPC_HTTP_56
      ? buildFactoryInventory({
          chainId: 56,
          rpcHttp: ENV.BSC_RPC_HTTP_56,
          activeFactoryAddress: ENV.FACTORY_ADDRESS_56,
          activeFactoryStartBlock: ENV.FACTORY_START_BLOCK_56,
          supportedFactoryAddresses: ENV.SUPPORTED_FACTORY_ADDRESSES_56,
          supportedFactoryStartBlocks: ENV.SUPPORTED_FACTORY_START_BLOCKS_56,
        })
      : []),
  ];
}

async function getCursor(factory: SupportedFactory): Promise<number> {
  const result = await pool.query(
    `select last_indexed_block from public.indexer_state where chain_id=$1 and cursor=$2`,
    [factory.chainId, factory.cursor],
  );
  return result.rowCount ? Number(result.rows[0].last_indexed_block || 0) : 0;
}

async function advanceCursor(factory: SupportedFactory, nextBlock: number): Promise<void> {
  await pool.query(
    `insert into public.indexer_state(chain_id,cursor,last_indexed_block)
     values($1,$2,$3)
     on conflict (chain_id,cursor) do update
       set last_indexed_block=greatest(public.indexer_state.last_indexed_block, excluded.last_indexed_block),
           updated_at=now()`,
    [factory.chainId, factory.cursor, nextBlock],
  );
}

async function upsertCampaign(input: {
  factory: SupportedFactory;
  campaign: string;
  token: string;
  creator: string;
  name: string;
  symbol: string;
  logoURI?: string | null;
  createdBlock?: number;
  createdAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `insert into public.campaigns(
       chain_id,factory_address,campaign_address,token_address,creator_address,
       name,symbol,logo_uri,created_block,created_at_chain,is_active
     ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
     on conflict (chain_id,campaign_address) do update set
       factory_address=coalesce(public.campaigns.factory_address, excluded.factory_address),
       token_address=coalesce(excluded.token_address, public.campaigns.token_address),
       creator_address=coalesce(excluded.creator_address, public.campaigns.creator_address),
       name=coalesce(nullif(excluded.name,''), public.campaigns.name),
       symbol=coalesce(nullif(excluded.symbol,''), public.campaigns.symbol),
       logo_uri=coalesce(nullif(public.campaigns.logo_uri,''), nullif(excluded.logo_uri,'')),
       created_block=case
         when coalesce(public.campaigns.created_block,0)=0 then excluded.created_block
         else public.campaigns.created_block
       end,
       created_at_chain=coalesce(public.campaigns.created_at_chain, excluded.created_at_chain),
       is_active=true,
       updated_at=now()`,
    [
      input.factory.chainId,
      input.factory.address,
      input.campaign.toLowerCase(),
      input.token.toLowerCase(),
      input.creator.toLowerCase(),
      input.name,
      input.symbol,
      input.logoURI || null,
      Number(input.createdBlock || 0),
      input.createdAt || null,
    ],
  );
}

async function syncRegistry(provider: ethers.JsonRpcProvider, factory: SupportedFactory): Promise<void> {
  const contract = new ethers.Contract(factory.address, LAUNCH_FACTORY_ABI, provider);
  const count = Number((await contract.campaignsCount()) as bigint);
  if (!Number.isFinite(count) || count <= 0) return;

  for (let id = 0; id < count; id += 1) {
    let info: any;
    try {
      info = await contract.getCampaign(id);
    } catch (error) {
      console.warn("[factory-discovery] getCampaign failed", {
        chainId: factory.chainId,
        factory: factory.address,
        id,
        error: String((error as any)?.message || error),
      });
      continue;
    }

    const campaign = String(info?.campaign ?? info?.[0] ?? "");
    if (!ethers.isAddress(campaign) || campaign === ethers.ZeroAddress) continue;

    const createdAtSeconds = Number(info?.createdAt ?? info?.[9] ?? 0);
    await upsertCampaign({
      factory,
      campaign,
      token: String(info?.token ?? info?.[1] ?? ethers.ZeroAddress),
      creator: String(info?.creator ?? info?.[2] ?? ethers.ZeroAddress),
      name: String(info?.name ?? info?.[3] ?? ""),
      symbol: String(info?.symbol ?? info?.[4] ?? ""),
      logoURI: String(info?.logoURI ?? info?.logoUri ?? info?.[5] ?? "") || null,
      createdAt: createdAtSeconds > 0 ? new Date(createdAtSeconds * 1000) : null,
    });
  }
}

async function scanEvents(provider: ethers.JsonRpcProvider, factory: SupportedFactory): Promise<void> {
  const head = Math.max(0, (await provider.getBlockNumber()) - ENV.CONFIRMATIONS);
  const state = await getCursor(factory);
  const fallback = Math.max(0, head - ENV.FACTORY_LOOKBACK_BLOCKS);
  let fromBlock = state > 0 ? state : factory.startBlock > 0 ? factory.startBlock : fallback;
  if (fromBlock > head) return;

  for (; fromBlock <= head; fromBlock += ENV.LOG_CHUNK_SIZE) {
    const toBlock = Math.min(head, fromBlock + ENV.LOG_CHUNK_SIZE - 1);
    const logs = await provider.getLogs({
      address: factory.address,
      fromBlock,
      toBlock,
      topics: [CAMPAIGN_CREATED.topicHash],
    });

    for (const log of logs) {
      const parsed = FACTORY_IFACE.parseLog(log);
      if (!parsed) continue;
      const block = await provider.getBlock(log.blockNumber);
      await upsertCampaign({
        factory,
        campaign: String((parsed.args as any).campaign),
        token: String((parsed.args as any).token),
        creator: String((parsed.args as any).creator),
        name: String((parsed.args as any).name),
        symbol: String((parsed.args as any).symbol),
        createdBlock: log.blockNumber,
        createdAt: block ? new Date(Number(block.timestamp) * 1000) : null,
      });
    }

    await advanceCursor(factory, toBlock + 1);
  }
}

async function runFactory(factory: SupportedFactory): Promise<void> {
  const rpcUrls = parseRpcList(factory.rpcHttp);
  if (rpcUrls.length === 0) throw new Error(`No RPC configured for chain ${factory.chainId}`);

  let lastError: unknown;
  for (const rpcUrl of rpcUrls) {
    const provider = new ethers.JsonRpcProvider(rpcUrl, factory.chainId, {
      batchMaxCount: 1,
      batchStallTime: 0,
    });
    try {
      const code = await provider.getCode(factory.address);
      if (code === "0x") throw new Error(`No contract code at ${factory.address}`);
      await syncRegistry(provider, factory);
      await scanEvents(provider, factory);
      return;
    } catch (error) {
      lastError = error;
      console.warn("[factory-discovery] RPC failed", {
        chainId: factory.chainId,
        factory: factory.address,
        rpcUrl,
        error: String((error as any)?.message || error),
      });
    }
  }
  throw lastError;
}

export async function runSupportedFactoryDiscoveryOnce(): Promise<void> {
  const factories = inventories();
  for (const factory of factories) {
    try {
      await runFactory(factory);
    } catch (error) {
      console.error("[factory-discovery] all RPCs failed", {
        chainId: factory.chainId,
        factory: factory.address,
        cursor: factory.cursor,
        error: String((error as any)?.message || error),
      });
    }
  }
}

export function startSupportedFactoryDiscoveryLoop(): void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await runSupportedFactoryDiscoveryOnce();
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => void run(), ENV.INDEXER_INTERVAL_MS);
}
