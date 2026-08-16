import { ethers } from "ethers";
import { pool } from "./db.js";

const TRANSFER_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const TRANSFER_TOPIC = TRANSFER_IFACE.getEvent("Transfer")!.topicHash;

let schemaReady = false;

export async function ensureTokenHolderSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.token_holder_balances (
      chain_id integer NOT NULL,
      token_address text NOT NULL,
      wallet text NOT NULL,
      balance_raw numeric(78,0) NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (chain_id, token_address, wallet)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS token_holder_balances_positive_idx
      ON public.token_holder_balances (chain_id, token_address, balance_raw DESC)
      WHERE balance_raw > 0
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.token_holder_sync (
      chain_id integer NOT NULL,
      token_address text NOT NULL,
      campaign_address text NOT NULL,
      last_block bigint NOT NULL DEFAULT 0,
      saw_mint boolean NOT NULL DEFAULT false,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (chain_id, token_address)
    )
  `);
  schemaReady = true;
}

async function applyBalanceDelta(
  chainId: number,
  token: string,
  wallet: string,
  delta: bigint,
) {
  if (!wallet || wallet === ethers.ZeroAddress.toLowerCase()) return;
  if (delta === 0n) return;
  await pool.query(
    `insert into public.token_holder_balances(chain_id, token_address, wallet, balance_raw)
     values ($1,$2,$3,$4)
     on conflict (chain_id, token_address, wallet) do update set
       balance_raw = public.token_holder_balances.balance_raw + excluded.balance_raw,
       updated_at = now()`,
    [chainId, token, wallet, delta.toString()],
  );
}

export async function catchUpTokenHolders(
  provider: ethers.JsonRpcProvider,
  input: {
    chainId: number;
    campaign: string;
    token: string;
    createdBlock: number;
    target: number;
    deadlineMs?: number;
    maxBlocks?: number;
    chunkSize?: number;
  },
): Promise<{ lastBlock: number; applied: number; complete: boolean }> {
  await ensureTokenHolderSchema();
  const chainId = Number(input.chainId);
  const token = String(input.token || "").toLowerCase();
  const campaign = String(input.campaign || "").toLowerCase();
  if (!ethers.isAddress(token) || !ethers.isAddress(campaign)) {
    return { lastBlock: 0, applied: 0, complete: false };
  }

  const target = Math.max(0, Number(input.target || 0));
  const created = Math.max(0, Number(input.createdBlock || 0));
  const maxBlocks = Math.max(500, Math.min(Number(input.maxBlocks || 8_000), 20_000));
  const chunkSize = Math.max(200, Math.min(Number(input.chunkSize || 2_000), 4_000));

  const sync = await pool.query(
    `select last_block, saw_mint
     from public.token_holder_sync
     where chain_id=$1 and token_address=$2`,
    [chainId, token],
  );
  let lastBlock = Number(sync.rows[0]?.last_block || 0);
  let sawMint = Boolean(sync.rows[0]?.saw_mint);
  if (lastBlock <= 0) lastBlock = created > 0 ? created - 1 : 0;
  if (created > 0 && lastBlock + 1 < created) lastBlock = created - 1;
  if (lastBlock >= target) {
    return { lastBlock, applied: 0, complete: sawMint };
  }

  const toBlock = Math.min(target, lastBlock + maxBlocks);
  let from = lastBlock + 1;
  let applied = 0;

  while (from <= toBlock) {
    if (input.deadlineMs && Date.now() >= input.deadlineMs) break;
    const end = Math.min(toBlock, from + chunkSize - 1);
    let logs: ethers.Log[] = [];
    try {
      logs = await provider.getLogs({
        address: token,
        topics: [TRANSFER_TOPIC],
        fromBlock: from,
        toBlock: end,
      });
    } catch (error) {
      console.warn("[holders] getLogs failed", {
        chainId,
        token,
        from,
        end,
        err: String((error as any)?.message || error),
      });
      break;
    }

    logs.sort((a, b) => a.blockNumber - b.blockNumber || Number(a.index ?? 0) - Number(b.index ?? 0));
    for (const log of logs) {
      try {
        const parsed = TRANSFER_IFACE.parseLog(log);
        if (!parsed) continue;
        const src = String(parsed.args.from || "").toLowerCase();
        const dest = String(parsed.args.to || "").toLowerCase();
        const value = BigInt(String(parsed.args.value || 0));
        if (src === ethers.ZeroAddress.toLowerCase()) sawMint = true;
        await applyBalanceDelta(chainId, token, src, -value);
        await applyBalanceDelta(chainId, token, dest, value);
        applied += 1;
      } catch {
        // skip malformed log
      }
    }

    lastBlock = end;
    from = end + 1;
    await pool.query(
      `insert into public.token_holder_sync(chain_id, token_address, campaign_address, last_block, saw_mint)
       values ($1,$2,$3,$4,$5)
       on conflict (chain_id, token_address) do update set
         campaign_address = excluded.campaign_address,
         last_block = greatest(public.token_holder_sync.last_block, excluded.last_block),
         saw_mint = public.token_holder_sync.saw_mint or excluded.saw_mint,
         updated_at = now()`,
      [chainId, token, campaign, lastBlock, sawMint],
    );
  }

  return { lastBlock, applied, complete: sawMint && lastBlock >= target };
}

export async function listTokenHolders(input: {
  chainId: number;
  token: string;
  campaign?: string | null;
  limit?: number;
}) {
  await ensureTokenHolderSchema();
  const chainId = Number(input.chainId);
  const token = String(input.token || "").toLowerCase();
  const campaign = String(input.campaign || "").toLowerCase();
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), 200);
  if (!ethers.isAddress(token)) {
    return { items: [] as Array<{ address: string; balanceRaw: string }>, holderCount: 0, complete: false, lastBlock: 0, createdBlock: 0 };
  }

  const [rows, sync, campaignRow] = await Promise.all([
    pool.query(
      `select wallet, balance_raw::text as balance_raw
       from public.token_holder_balances
       where chain_id=$1
         and token_address=$2
         and balance_raw > 0
         and wallet <> $2
         and ($3::text = '' or wallet <> $3)
       order by balance_raw desc
       limit $4`,
      [chainId, token, ethers.isAddress(campaign) ? campaign : "", limit],
    ),
    pool.query(
      `select last_block, saw_mint
       from public.token_holder_sync
       where chain_id=$1 and token_address=$2`,
      [chainId, token],
    ),
    pool.query(
      `select coalesce(created_block,0)::bigint as created_block,
              campaign_address
       from public.campaigns
       where chain_id=$1 and (token_address=$2 or campaign_address=$3)
       order by case when token_address=$2 then 0 else 1 end
       limit 1`,
      [chainId, token, ethers.isAddress(campaign) ? campaign : token],
    ),
  ]);

  const count = await pool.query(
    `select count(*)::int as n
     from public.token_holder_balances
     where chain_id=$1
       and token_address=$2
       and balance_raw > 0
       and wallet <> $2
       and ($3::text = '' or wallet <> $3)`,
    [chainId, token, ethers.isAddress(campaign) ? campaign : ""],
  );

  const lastBlock = Number(sync.rows[0]?.last_block || 0);
  const sawMint = Boolean(sync.rows[0]?.saw_mint);
  const createdBlock = Number(campaignRow.rows[0]?.created_block || 0);
  const campaignAddress = String(campaignRow.rows[0]?.campaign_address || campaign || "");

  return {
    items: (rows.rows || []).map((row: { wallet: string; balance_raw: string }) => ({
      address: String(row.wallet),
      balanceRaw: String(row.balance_raw || "0"),
    })),
    holderCount: Number(count.rows[0]?.n || 0),
    complete: sawMint && lastBlock > 0 && (createdBlock <= 0 || lastBlock >= createdBlock),
    lastBlock,
    createdBlock,
    campaignAddress,
    sawMint,
  };
}
