import { getPublicRpcUrl, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { getSolanaProvider } from "@/lib/solanaWallet";
import { loadSolanaWeb3 } from "@/lib/solanaWeb3";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

export type SolanaAirdropClaimCall = {
  rewardLedgerId: string;
  chainId: number;
  tokenSymbol: "SOL" | string;
  mode: "solana_airdrop";
  enabled: boolean;
  reason: string | null;
  programId: string;
  configAddress: string;
  vaultAddress: string;
  batchAddress: string;
  claimReceiptAddress: string;
  epochId: string;
  programCode: number;
  amount: string;
  proof: string[];
  recipient: string;
  explorerTxBase?: string;
};

function hexToBytes(value: string): Uint8Array {
  const hex = String(value || "").trim().replace(/^0x/i, "");
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return new Uint8Array();
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function u32le(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const n = value >>> 0;
  out[0] = n & 0xff;
  out[1] = (n >>> 8) & 0xff;
  out[2] = (n >>> 16) & 0xff;
  out[3] = (n >>> 24) & 0xff;
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
  if (n !== 0n) throw new Error("u64 overflow");
  return out;
}

function i64le(value: string | number | bigint): Uint8Array {
  let n = BigInt(value);
  const min = -(1n << 63n);
  const max = (1n << 63n) - 1n;
  if (n < min || n > max) throw new Error("i64 overflow");
  if (n < 0n) n = (1n << 64n) + n;
  return u64le(n);
}

async function anchorDiscriminator(instructionName: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(`global:${instructionName}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest).slice(0, 8);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function submitSolanaAirdropClaim(call: SolanaAirdropClaimCall): Promise<string> {
  if (!call.enabled) throw new Error(call.reason || "Solana airdrop claim is not ready.");
  if (Number(call.chainId) !== SOLANA_CHAIN_ID) throw new Error("Wrong Solana chain for reward claim.");

  const provider = getSolanaProvider();
  if (!provider?.publicKey || typeof provider.signTransaction !== "function") {
    throw new Error("Connect a Solana wallet that can sign this reward claim.");
  }

  const winner = String(provider.publicKey.toString?.() || provider.publicKey);
  if (winner !== String(call.recipient || "").trim()) {
    throw new Error("Connected Solana wallet does not own this reward.");
  }

  const proof = (call.proof || []).map(hexToBytes);
  if (proof.some((item) => item.length !== 32)) throw new Error("Invalid Solana reward Merkle proof.");

  const discriminator = await anchorDiscriminator("claim_airdrop");
  const data = concat([
    discriminator,
    i64le(call.epochId),
    Uint8Array.from([Number(call.programCode) & 0xff]),
    u64le(call.amount),
    u32le(proof.length),
    ...proof,
  ]);

  const web3 = await loadSolanaWeb3();
  const { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } = web3;
  const rpc =
    String(import.meta.env.VITE_SOLANA_RPC || "").trim() ||
    getPublicRpcUrl(SOLANA_CHAIN_ID) ||
    "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const ix = new TransactionInstruction({
    programId: new PublicKey(call.programId),
    keys: [
      { pubkey: new PublicKey(winner), isSigner: true, isWritable: true },
      { pubkey: new PublicKey(call.configAddress), isSigner: false, isWritable: false },
      { pubkey: new PublicKey(call.vaultAddress), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(call.batchAddress), isSigner: false, isWritable: true },
      { pubkey: new PublicKey(call.claimReceiptAddress), isSigner: false, isWritable: true },
      { pubkey: SystemProgram?.programId || new PublicKey(SYSTEM_PROGRAM), isSigner: false, isWritable: false },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = new PublicKey(winner);
  tx.recentBlockhash = latest.blockhash;
  const signed = await provider.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
  await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  return signature;
}
