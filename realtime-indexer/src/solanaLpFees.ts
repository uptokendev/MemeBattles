import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Pool } from "pg";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const SOLANA_CHAIN_ID = 101;
const CREATOR_FEE_BPS = 8000;
const PROTOCOL_FEE_BPS = 2000;
const BPS = 10_000;

function solanaRpcUrl(): string {
  return String(process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC || "https://api.devnet.solana.com").trim();
}

function protocolTreasury(): string {
  return String(
    process.env.SOLANA_PROTOCOL_TREASURY_ADDRESS ||
      process.env.SOLANA_VOTE_TREASURY_ADDRESS ||
      "",
  ).trim();
}

function parseOperatorKey(): Keypair | null {
  const raw = String(
    process.env.SOLANA_HARVEST_OPERATOR_SECRET ||
      process.env.SOLANA_TREASURY_OPERATOR_SECRET ||
      process.env.SOLANA_OPERATOR_SECRET ||
      "",
  ).trim();
  if (!raw) return null;
  try {
    if (raw.startsWith("[")) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    }
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const bytes = [0];
    for (const ch of raw) {
      const idx = alphabet.indexOf(ch);
      if (idx < 0) return null;
      let carry = idx;
      for (let i = 0; i < bytes.length; i += 1) {
        const n = bytes[i] * 58 + carry;
        bytes[i] = n & 255;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 255);
        carry >>= 8;
      }
    }
    return Keypair.fromSecretKey(Uint8Array.from(bytes.reverse()));
  } catch {
    return null;
  }
}

function toBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (value && typeof value === "object" && "toString" in value) return BigInt(String(value.toString()));
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
}

function formatAmount(raw: bigint, decimals: number): string {
  if (raw <= 0n) return "0";
  const scale = 10n ** BigInt(Math.max(0, decimals));
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export async function listSolanaLpFees(input: {
  pool: Pool;
  creator?: string | null;
  campaign?: string | null;
  limit: number;
}) {
  const params: unknown[] = [SOLANA_CHAIN_ID];
  const clauses = [
    "c.chain_id = $1",
    "c.graduated_at_chain is not null",
    "coalesce(c.meta #>> '{solanaGraduation,pool}','') <> ''",
  ];
  if (input.campaign) {
    params.push(input.campaign);
    clauses.push(`c.campaign_address = $${params.length}`);
  }
  if (input.creator) {
    params.push(input.creator);
    clauses.push(`c.creator_address = $${params.length}`);
  }
  params.push(input.limit);
  const { rows } = await input.pool.query(
    `select c.campaign_address, c.token_address, c.creator_address, c.name, c.symbol,
            c.graduated_at_chain, c.meta
       from public.campaigns c
      where ${clauses.join(" and ")}
      order by c.graduated_at_chain desc nulls last
      limit $${params.length}`,
    params,
  );

  const connection = new Connection(solanaRpcUrl(), "confirmed");
  const cpAmm = new CpAmm(connection as any);
  const items = [];
  for (const row of rows) {
    const meta = row.meta?.solanaGraduation || {};
    const poolAddress = String(meta.pool || "").trim();
    const positionAddress = String(meta.position || "").trim();
    const base = {
      chainId: SOLANA_CHAIN_ID,
      campaignAddress: String(row.campaign_address || ""),
      tokenAddress: row.token_address ? String(row.token_address) : null,
      creatorAddress: row.creator_address ? String(row.creator_address) : null,
      name: row.name || null,
      symbol: row.symbol || null,
      graduatedAt: row.graduated_at_chain || null,
      marketStage: "GRADUATED",
      pairAddress: poolAddress || null,
    };
    if (!poolAddress || !positionAddress) {
      items.push({ ...base, fees: { registered: false, note: "Missing Meteora pool/position on campaign meta." } });
      continue;
    }
    try {
      const position = await cpAmm.fetchPositionState(new PublicKey(positionAddress));
      const tokenA = toBigInt((position as any).feeAPending);
      const tokenB = toBigInt((position as any).feeBPending);
      items.push({
        ...base,
        fees: {
          registered: true,
          pairLabel: "Meteora DAMM v2",
          token0Meta: { symbol: row.symbol || "TOKEN" },
          token1Meta: { symbol: "SOL" },
          unharvested: {
            token0: Number(formatAmount(tokenA, 6)),
            token1: Number(formatAmount(tokenB, 9)),
            token0Display: formatAmount(tokenA, 6),
            token1Display: formatAmount(tokenB, 9),
            token0Symbol: row.symbol || "TOKEN",
            token1Symbol: "SOL",
            creatorShareToken0Display: formatAmount((tokenA * BigInt(CREATOR_FEE_BPS)) / BigInt(BPS), 6),
            creatorShareToken1Display: formatAmount((tokenB * BigInt(CREATOR_FEE_BPS)) / BigInt(BPS), 9),
            protocolShareToken0Display: formatAmount((tokenA * BigInt(PROTOCOL_FEE_BPS)) / BigInt(BPS), 6),
            protocolShareToken1Display: formatAmount((tokenB * BigInt(PROTOCOL_FEE_BPS)) / BigInt(BPS), 9),
            source: "meteora_position_fee_pending",
            note: "80% creator / 20% protocol on harvest. Principal stays permanently locked.",
          },
        },
      });
    } catch (error: any) {
      items.push({
        ...base,
        fees: {
          registered: true,
          pairLabel: "Meteora DAMM v2",
          error: String(error?.message || error),
        },
      });
    }
  }
  return {
    ok: true,
    chainId: SOLANA_CHAIN_ID,
    lockerAddress: null,
    split: { creatorBps: CREATOR_FEE_BPS, protocolBps: PROTOCOL_FEE_BPS },
    notes: [
      "Solana LP fees accrue on the permanently locked DAMM v2 position.",
      "Harvest claims fees then splits 80% creator / 20% protocol.",
    ],
    items,
    updatedAt: new Date().toISOString(),
  };
}

export async function harvestSolanaLpFees(input: {
  pool: Pool;
  campaign?: string | null;
  pair?: string | null;
}) {
  const operator = parseOperatorKey();
  if (!operator) {
    throw Object.assign(new Error("Solana harvest operator key is not configured (SOLANA_HARVEST_OPERATOR_SECRET)."), {
      status: 503,
    });
  }
  const treasury = protocolTreasury();
  if (!treasury) {
    throw Object.assign(new Error("SOLANA_PROTOCOL_TREASURY_ADDRESS is required for the 20% protocol share."), {
      status: 503,
    });
  }

  const clauses = ["c.chain_id = $1", "c.graduated_at_chain is not null"];
  const params: unknown[] = [SOLANA_CHAIN_ID];
  if (input.campaign) {
    params.push(input.campaign);
    clauses.push(`c.campaign_address = $${params.length}`);
  }
  if (input.pair) {
    params.push(input.pair);
    clauses.push(`c.meta #>> '{solanaGraduation,pool}' = $${params.length}`);
  }
  const { rows } = await input.pool.query(
    `select c.campaign_address, c.token_address, c.creator_address, c.meta
       from public.campaigns c
      where ${clauses.join(" and ")}
      limit 1`,
    params,
  );
  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error("Graduated Solana campaign with a Meteora pool was not found."), { status: 404 });
  }
  const meta = row.meta?.solanaGraduation || {};
  const poolAddress = String(meta.pool || "").trim();
  const positionAddress = String(meta.position || "").trim();
  const mint = String(row.token_address || "").trim();
  const creator = String(row.creator_address || "").trim();
  if (!poolAddress || !positionAddress || !mint || !creator) {
    throw Object.assign(new Error("Campaign is missing Meteora pool, position, mint, or creator."), { status: 400 });
  }

  const connection = new Connection(solanaRpcUrl(), "confirmed");
  const cpAmm = new CpAmm(connection as any);
  const poolPk = new PublicKey(poolAddress);
  const positionPk = new PublicKey(positionAddress);
  const mintPk = new PublicKey(mint);
  const poolState = await cpAmm.fetchPoolState(poolPk);
  const tokenAMint = poolState.tokenAMint;
  const tokenBMint = poolState.tokenBMint;
  const positionNftMint = (await cpAmm.fetchPositionState(positionPk) as any).nftMint || (await cpAmm.fetchPositionState(positionPk) as any).nft_mint;
  const nftMint = positionNftMint instanceof PublicKey ? positionNftMint : new PublicKey(String(positionNftMint));
  const positionNftAccount = PublicKey.findProgramAddressSync(
    [operator.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), nftMint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
  )[0];

  const built = cpAmm.claimPositionFee({
    owner: operator.publicKey,
    position: positionPk,
    pool: poolPk,
    positionNftAccount,
    tokenAMint,
    tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    receiver: operator.publicKey,
    feePayer: operator.publicKey,
  });
  const builder = built as { transaction?: () => Promise<Transaction> | Transaction; build?: () => Promise<Transaction> | Transaction };
  const claimTx =
    typeof builder.transaction === "function"
      ? await builder.transaction()
      : typeof builder.build === "function"
        ? await builder.build()
        : (built as unknown as Transaction);
  const signature = await sendAndConfirmTransaction(connection, claimTx, [operator], { commitment: "confirmed" });

  return {
    ok: true,
    chainId: SOLANA_CHAIN_ID,
    campaignAddress: String(row.campaign_address),
    pairAddress: poolAddress,
    creatorAddress: creator,
    protocolTreasury: treasury,
    split: { creatorBps: CREATOR_FEE_BPS, protocolBps: PROTOCOL_FEE_BPS },
    txHash: signature,
    note: "Claimed Meteora position fees to the harvest operator. 80/20 ATA split lands in the next program ix; fees are now off the locked position.",
  };
}
