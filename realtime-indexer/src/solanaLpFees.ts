import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { Pool } from "pg";

const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");

const SOLANA_CHAIN_ID = 101;
const CREATOR_FEE_BPS = 8000;
const PROTOCOL_FEE_BPS = 2000;
const BPS = 10_000;

function solanaRpcUrl(): string {
  return String(process.env.SOLANA_RPC_URL || process.env.SOLANA_RPC || "https://api.devnet.solana.com").trim();
}

function protocolTreasury(operator: PublicKey): PublicKey {
  const raw = String(
    process.env.SOLANA_PROTOCOL_TREASURY_ADDRESS ||
      process.env.SOLANA_VOTE_TREASURY_ADDRESS ||
      "",
  ).trim();
  if (raw) {
    try {
      return new PublicKey(raw);
    } catch {
      // fall through to operator
    }
  }
  return operator;
}

function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function createAtaIdempotentIx(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: deriveAta(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

function transferTokenIx(source: PublicKey, dest: PublicKey, owner: PublicKey, amount: bigint): TransactionInstruction {
  const data = Buffer.alloc(9);
  data[0] = 3;
  data.writeBigUInt64LE(amount, 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ],
    data,
  });
}

async function tokenBalance(connection: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const res = await connection.getTokenAccountBalance(ata);
    return BigInt(res.value.amount || "0");
  } catch {
    return 0n;
  }
}

function splitAmounts(total: bigint): { creator: bigint; protocol: bigint } {
  if (total <= 0n) return { creator: 0n, protocol: 0n };
  const creator = (total * BigInt(CREATOR_FEE_BPS)) / BigInt(BPS);
  return { creator, protocol: total - creator };
}

function mintDecimals(mint: PublicKey, tokenMint: PublicKey, tokenDecimals: number): number {
  if (mint.equals(NATIVE_MINT)) return 9;
  if (mint.equals(tokenMint)) return tokenDecimals;
  return 6;
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
      const poolState = await cpAmm.fetchPoolState(new PublicKey(poolAddress));
      const tokenA = toBigInt((position as any).feeAPending);
      const tokenB = toBigInt((position as any).feeBPending);
      const mintA = poolState.tokenAMint;
      const mintB = poolState.tokenBMint;
      const tokenMint = String(row.token_address || "");
      const decA = mintDecimals(mintA, tokenMint ? new PublicKey(tokenMint) : mintA, 6);
      const decB = mintDecimals(mintB, tokenMint ? new PublicKey(tokenMint) : mintB, 6);
      const symA = mintA.equals(NATIVE_MINT) ? "SOL" : (row.symbol || "TOKEN");
      const symB = mintB.equals(NATIVE_MINT) ? "SOL" : (row.symbol || "TOKEN");
      const splitA = splitAmounts(tokenA);
      const splitB = splitAmounts(tokenB);
      const harvested = row.meta?.solanaGraduation?.harvest || {};
      items.push({
        ...base,
        fees: {
          registered: true,
          pairLabel: "Meteora DAMM v2",
          token0Meta: { symbol: symA },
          token1Meta: { symbol: symB },
          unharvested: {
            token0: Number(formatAmount(tokenA, decA)),
            token1: Number(formatAmount(tokenB, decB)),
            token0Display: formatAmount(tokenA, decA),
            token1Display: formatAmount(tokenB, decB),
            token0Symbol: symA,
            token1Symbol: symB,
            creatorShareToken0Display: formatAmount(splitA.creator, decA),
            creatorShareToken1Display: formatAmount(splitB.creator, decB),
            protocolShareToken0Display: formatAmount(splitA.protocol, decA),
            protocolShareToken1Display: formatAmount(splitB.protocol, decB),
            source: "meteora_position_fee_pending",
            note: "80% creator / 20% protocol on harvest. Principal stays permanently locked.",
          },
          harvestedLifetime: harvested.lastTx
            ? {
                lastTx: harvested.lastTx,
                lastAt: harvested.lastAt || null,
                creatorToken0Display: harvested.creatorADisplay || null,
                creatorToken1Display: harvested.creatorBDisplay || null,
                protocolToken0Display: harvested.protocolADisplay || null,
                protocolToken1Display: harvested.protocolBDisplay || null,
              }
            : undefined,
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
  const treasury = protocolTreasury(operator.publicKey);

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
  const tokenMint = new PublicKey(mint);
  const creatorPk = new PublicKey(creator);
  const poolState = await cpAmm.fetchPoolState(poolPk);
  const tokenAMint = poolState.tokenAMint;
  const tokenBMint = poolState.tokenBMint;
  const positionState = await cpAmm.fetchPositionState(positionPk);
  const positionNftMint = (positionState as any).nftMint || (positionState as any).nft_mint;
  const nftMint = positionNftMint instanceof PublicKey ? positionNftMint : new PublicKey(String(positionNftMint));
  const positionNftAccount = deriveAta(operator.publicKey, nftMint);

  const operatorAtaA = deriveAta(operator.publicKey, tokenAMint);
  const operatorAtaB = deriveAta(operator.publicKey, tokenBMint);
  const beforeA = await tokenBalance(connection, operatorAtaA);
  const beforeB = await tokenBalance(connection, operatorAtaB);

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
  const claimSignature = await sendAndConfirmTransaction(connection, claimTx, [operator], { commitment: "confirmed" });

  const afterA = await tokenBalance(connection, operatorAtaA);
  const afterB = await tokenBalance(connection, operatorAtaB);
  const deltaA = afterA > beforeA ? afterA - beforeA : 0n;
  const deltaB = afterB > beforeB ? afterB - beforeB : 0n;
  const splitA = splitAmounts(deltaA);
  const splitB = splitAmounts(deltaB);
  const decA = mintDecimals(tokenAMint, tokenMint, 6);
  const decB = mintDecimals(tokenBMint, tokenMint, 6);

  const splitIxs: TransactionInstruction[] = [];
  const addSplit = (mint: PublicKey, source: PublicKey, split: { creator: bigint; protocol: bigint }) => {
    if (split.creator > 0n && !creatorPk.equals(operator.publicKey)) {
      splitIxs.push(createAtaIdempotentIx(operator.publicKey, creatorPk, mint));
      splitIxs.push(transferTokenIx(source, deriveAta(creatorPk, mint), operator.publicKey, split.creator));
    }
    if (split.protocol > 0n && !treasury.equals(operator.publicKey)) {
      splitIxs.push(createAtaIdempotentIx(operator.publicKey, treasury, mint));
      splitIxs.push(transferTokenIx(source, deriveAta(treasury, mint), operator.publicKey, split.protocol));
    }
  };
  addSplit(tokenAMint, operatorAtaA, splitA);
  addSplit(tokenBMint, operatorAtaB, splitB);

  let splitSignature = "";
  if (splitIxs.length) {
    const splitTx = new Transaction().add(...splitIxs);
    splitSignature = await sendAndConfirmTransaction(connection, splitTx, [operator], { commitment: "confirmed" });
  }

  const harvestMeta = {
    lastTx: splitSignature || claimSignature,
    claimTx: claimSignature,
    splitTx: splitSignature || null,
    lastAt: new Date().toISOString(),
    creatorADisplay: formatAmount(splitA.creator, decA),
    creatorBDisplay: formatAmount(splitB.creator, decB),
    protocolADisplay: formatAmount(splitA.protocol, decA),
    protocolBDisplay: formatAmount(splitB.protocol, decB),
    protocolTreasury: treasury.toBase58(),
  };
  await input.pool.query(
    `update public.campaigns
        set meta = jsonb_set(coalesce(meta, '{}'::jsonb), '{solanaGraduation,harvest}', $3::jsonb, true)
      where chain_id = $1 and campaign_address = $2`,
    [SOLANA_CHAIN_ID, String(row.campaign_address), JSON.stringify(harvestMeta)],
  ).catch((error) => {
    console.warn("[solana-lp-fees] harvest meta persist failed", error instanceof Error ? error.message : error);
  });

  return {
    ok: true,
    chainId: SOLANA_CHAIN_ID,
    campaignAddress: String(row.campaign_address),
    pairAddress: poolAddress,
    creatorAddress: creator,
    protocolTreasury: treasury.toBase58(),
    split: { creatorBps: CREATOR_FEE_BPS, protocolBps: PROTOCOL_FEE_BPS },
    claimed: {
      tokenA: formatAmount(deltaA, decA),
      tokenB: formatAmount(deltaB, decB),
      creatorA: harvestMeta.creatorADisplay,
      creatorB: harvestMeta.creatorBDisplay,
      protocolA: harvestMeta.protocolADisplay,
      protocolB: harvestMeta.protocolBDisplay,
    },
    txHash: harvestMeta.lastTx,
    claimTx: claimSignature,
    splitTx: splitSignature || null,
    note:
      deltaA === 0n && deltaB === 0n
        ? "No unclaimed Meteora fees on this position."
        : "Claimed locked-position fees and sent 80% to the creator / 20% to the protocol treasury. Principal stays locked.",
  };
}
