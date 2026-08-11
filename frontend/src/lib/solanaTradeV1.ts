/**
 * Solana V1 bonding trade: exact SOL-in buy / exact tokens-in sell.
 * Authorize via Railway → Ed25519 + buy_tokens/sell_tokens.
 * Does not touch BNB launchpad paths.
 */
import { apiFetch } from "@/lib/apiBase";
import { getPublicRpcUrl, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { getSolanaProvider } from "@/lib/solanaWallet";
import { loadSolanaWeb3, type SolanaWeb3Module } from "@/lib/solanaWeb3";

const ED25519_PROGRAM_ID = "Ed25519SigVerify111111111111111111111111111";
const SYSVAR_INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const ASSOCIATED_TOKEN_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

/** Anchor sha256("global:buy_tokens")[0..8] */
const BUY_TOKENS_DISCRIMINATOR = new Uint8Array([0xbd, 0x15, 0xe6, 0x85, 0xf7, 0x02, 0x6e, 0x2a]);
/** Anchor sha256("global:sell_tokens")[0..8] */
const SELL_TOKENS_DISCRIMINATOR = new Uint8Array([0x72, 0xf2, 0x19, 0x0c, 0x3e, 0x7e, 0x5c, 0x02]);

export type SolanaTradeSide = "buy" | "sell";

export type SolanaTradeAuthResponse = {
  schemaVersion: number;
  side: SolanaTradeSide;
  sideCode: number;
  chainId: number;
  programId: string;
  createArgs: {
    amountIn: string;
    minOut: string;
    deadline: string;
    nonce: number[];
  };
  accounts: {
    trader: string;
    globalConfig: string;
    campaign: string;
    mint: string;
    tokenVault: string | null;
    solVault: string | null;
    traderTokenAccount: string;
    riskProfile: string;
    tradeAuthorization: string;
    instructions: string;
    tokenProgram: string;
    systemProgram: string;
  };
  authorization: {
    digestHex: string;
    digestBase64: string;
    signatureBase64: string;
    routeSigner: string;
    deadline: string;
  };
};

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function u64le(value: string | number | bigint): Uint8Array {
  let n = BigInt(value);
  if (n < 0n) throw new Error("u64 cannot be negative");
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function i64le(value: string | number | bigint): Uint8Array {
  let n = BigInt(value);
  const out = new Uint8Array(8);
  if (n < 0n) n = (1n << 64n) + n;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function encodeTradeIxData(
  discriminator: Uint8Array,
  amountIn: string,
  minOut: string,
  deadline: string,
  nonce: number[],
): Uint8Array {
  const parts = [discriminator, u64le(amountIn), u64le(minOut), i64le(deadline), Uint8Array.from(nonce)];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function buildEd25519Ix(web3: SolanaWeb3Module, publicKey: string, message: Uint8Array, signature: Uint8Array) {
  const { PublicKey, Ed25519Program } = web3;
  const publicKeyBytes = new PublicKey(publicKey).toBytes();
  if (typeof Ed25519Program?.createInstructionWithPublicKey === "function") {
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: publicKeyBytes,
      message,
      signature,
    });
  }
  throw new Error("Ed25519Program helper unavailable in bundled web3.");
}

/** Linear curve quote helpers (mirror on-chain authorized_trade.rs). */
export function checkedLinearCurveCost(
  basePrice: bigint,
  slope: bigint,
  startSupply: bigint,
  tokenAmount: bigint,
): bigint {
  if (tokenAmount <= 0n) return 0n;
  const baseCost = tokenAmount * basePrice;
  const supplyCost = tokenAmount * startSupply;
  const stepSum = (tokenAmount * (tokenAmount - 1n)) / 2n;
  return baseCost + slope * (supplyCost + stepSum);
}

export function quoteBuyTokens(
  basePrice: bigint,
  slope: bigint,
  sold: bigint,
  curveSupply: bigint,
  netLamports: bigint,
): bigint {
  if (netLamports <= 0n || basePrice <= 0n || sold >= curveSupply) return 0n;
  const remaining = curveSupply - sold;
  let high = netLamports / basePrice;
  if (high > remaining) high = remaining;
  if (high <= 0n) return 0n;
  let low = 0n;
  while (low < high) {
    const mid = low + (high - low + 1n) / 2n;
    const cost = checkedLinearCurveCost(basePrice, slope, sold, mid);
    if (cost <= netLamports) low = mid;
    else high = mid - 1n;
  }
  return low;
}

export function quoteSellRefund(
  basePrice: bigint,
  slope: bigint,
  sold: bigint,
  tokenAmount: bigint,
): bigint {
  if (tokenAmount <= 0n || sold < tokenAmount) return 0n;
  return checkedLinearCurveCost(basePrice, slope, sold - tokenAmount, tokenAmount);
}

export function calculateFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10_000n;
}

export async function requestSolanaTradeAuthorization(input: {
  side: SolanaTradeSide;
  campaignAddress: string;
  mintAddress: string;
  traderAddress: string;
  amountIn: string | bigint;
  minOut: string | bigint;
  tokenVault?: string | null;
  solVault?: string | null;
  campaignId?: number[] | string | null;
  chainId?: number;
}): Promise<SolanaTradeAuthResponse> {
  const res = await apiFetch("/api/solana/trade-authorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      side: input.side,
      campaignAddress: input.campaignAddress,
      mintAddress: input.mintAddress,
      traderAddress: input.traderAddress,
      amountIn: String(input.amountIn),
      minOut: String(input.minOut),
      tokenVault: input.tokenVault || null,
      solVault: input.solVault || null,
      campaignId: input.campaignId || null,
      chainId: input.chainId || SOLANA_CHAIN_ID,
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(payload?.error || payload?.message || `Trade authorize failed (${res.status})`));
  }
  if (!payload?.accounts?.tokenVault || !payload?.accounts?.solVault) {
    throw new Error(
      "Trade authorize response missing tokenVault/solVault. Pass vault addresses from campaign create accounts.",
    );
  }
  return payload as SolanaTradeAuthResponse;
}

export async function submitSolanaTradeV1(
  auth: SolanaTradeAuthResponse,
  opts?: { traderAddress?: string },
): Promise<{ signature: string }> {
  const provider = getSolanaProvider();
  if (!provider?.publicKey || typeof provider.signTransaction !== "function") {
    throw new Error("Connect a Solana wallet that can sign transactions.");
  }
  const traderPk = String(provider.publicKey.toString?.() || provider.publicKey || "");
  if (opts?.traderAddress && opts.traderAddress !== traderPk) {
    throw new Error("Connected Solana wallet does not match trader.");
  }
  if (auth.accounts.trader !== traderPk) {
    throw new Error("Authorization trader does not match connected wallet.");
  }

  const web3 = await loadSolanaWeb3();
  const { Connection, Transaction, PublicKey, ComputeBudgetProgram, TransactionInstruction } = web3;
  const rpc =
    String(import.meta.env.VITE_SOLANA_RPC || "").trim() ||
    getPublicRpcUrl(SOLANA_CHAIN_ID) ||
    "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const digest = base64ToBytes(auth.authorization.digestBase64);
  const signature = base64ToBytes(auth.authorization.signatureBase64);
  const ed25519Ix = buildEd25519Ix(web3, auth.authorization.routeSigner, digest, signature);

  const isBuy = auth.side === "buy";
  const data = encodeTradeIxData(
    isBuy ? BUY_TOKENS_DISCRIMINATOR : SELL_TOKENS_DISCRIMINATOR,
    auth.createArgs.amountIn,
    auth.createArgs.minOut,
    auth.createArgs.deadline,
    auth.createArgs.nonce,
  );

  const a = auth.accounts;
  const keys = [
    { pubkey: new PublicKey(a.trader), isSigner: true, isWritable: true },
    { pubkey: new PublicKey(a.globalConfig), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(a.campaign), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(a.mint), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(a.tokenVault!), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(a.solVault!), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(a.traderTokenAccount), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(a.riskProfile), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(a.tradeAuthorization), isSigner: false, isWritable: true },
    { pubkey: new PublicKey(a.instructions || SYSVAR_INSTRUCTIONS), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(a.tokenProgram || TOKEN_PROGRAM), isSigner: false, isWritable: false },
    { pubkey: new PublicKey(a.systemProgram || SYSTEM_PROGRAM), isSigner: false, isWritable: false },
  ];

  const tradeIx = new TransactionInstruction({
    programId: new PublicKey(auth.programId),
    keys,
    data,
  });

  const tx = new Transaction();
  try {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  } catch {
    /* optional */
  }
  tx.add(ed25519Ix);
  tx.add(tradeIx);

  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = new PublicKey(traderPk);
  tx.recentBlockhash = latest.blockhash;

  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  return { signature: sig };
}

/** Ensure trader ATA exists (create if missing). Returns ATA address. */
export async function ensureTraderAta(input: {
  mint: string;
  owner: string;
}): Promise<string> {
  const web3 = await loadSolanaWeb3();
  const { Connection, PublicKey, Transaction, SystemProgram, TransactionInstruction } = web3;
  const rpc =
    String(import.meta.env.VITE_SOLANA_RPC || "").trim() ||
    getPublicRpcUrl(SOLANA_CHAIN_ID) ||
    "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const mint = new PublicKey(input.mint);
  const owner = new PublicKey(input.owner);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), new PublicKey(TOKEN_PROGRAM).toBuffer(), mint.toBuffer()],
    new PublicKey(ASSOCIATED_TOKEN_PROGRAM),
  );
  const info = await connection.getAccountInfo(ata, "confirmed");
  if (info) return ata.toBase58();

  const provider = getSolanaProvider();
  if (!provider?.signTransaction) throw new Error("Connect Solana wallet to create token account.");

  // createIdempotent associated token account instruction
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
  ];
  const ix = new TransactionInstruction({
    programId: new PublicKey(ASSOCIATED_TOKEN_PROGRAM),
    keys,
    data: new Uint8Array([1]), // CreateIdempotent
  });
  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = owner;
  tx.recentBlockhash = latest.blockhash;
  const signed = await provider.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  return ata.toBase58();
}
