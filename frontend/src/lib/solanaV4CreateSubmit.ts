/**
 * Submit Solana V4 authorized createCampaign.
 *
 * Builds: Ed25519 verify (route-signer digest) → createCampaign (creator fee-payer).
 * Does not use the legacy solanaLaunchpadAdapter scaffold.
 */
import {
  buildSolanaCreateCampaignV4Plan,
  type SolanaV4GeneratedIdlInvocationPlan,
} from "@/lib/solanaCreateCampaignV4Plan";
import type { SolanaV4CreateAuthorizationResponse } from "@/lib/solanaCreateAuthorizationV4";
import { getSolanaProvider } from "@/lib/solanaWallet";
import { getPublicRpcUrl, SOLANA_CHAIN_ID } from "@/lib/chainConfig";
import { loadSolanaWeb3, type SolanaWeb3Module } from "@/lib/solanaWeb3";

const ED25519_PROGRAM_ID = "Ed25519SigVerify111111111111111111111111111";
const SYSVAR_INSTRUCTIONS = "Sysvar1nstructions1111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Anchor 0.30: first 8 bytes of sha256("global:create_campaign") */
const CREATE_CAMPAIGN_DISCRIMINATOR = new Uint8Array([
  0x6f, 0x83, 0xbb, 0x62, 0xa0, 0xc1, 0x72, 0xf4,
]);

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
  // two's complement
  if (n < 0n) n = (1n << 64n) + n;
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

function encodeCreateCampaignData(args: SolanaV4GeneratedIdlInvocationPlan["createCampaign"]["args"]): Uint8Array {
  const parts: Uint8Array[] = [CREATE_CAMPAIGN_DISCRIMINATOR];
  const pushBytes = (arr: number[]) => {
    parts.push(Uint8Array.from(arr));
  };
  pushBytes(args.campaignId);
  pushBytes(args.metadataHash);
  pushBytes(args.clusterHash);
  pushBytes(args.tickerHash);
  pushBytes(args.reservationIdHash);
  parts.push(u64le(args.reservationVersion));
  parts.push(i64le(args.launchAt));
  parts.push(u64le(args.graduationTargetUsdMicros));
  parts.push(i64le(args.deadline));
  pushBytes(args.nonce);

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

function buildEd25519VerifyIx(web3: SolanaWeb3Module, plan: SolanaV4GeneratedIdlInvocationPlan) {
  const { PublicKey, Ed25519Program, TransactionInstruction } = web3;
  const publicKeyBytes = new PublicKey(plan.ed25519Verification.publicKey).toBytes();
  const message = plan.ed25519Verification.message;
  const signature = plan.ed25519Verification.signature;

  if (typeof Ed25519Program?.createInstructionWithPublicKey === "function") {
    return Ed25519Program.createInstructionWithPublicKey({
      publicKey: publicKeyBytes,
      message,
      signature,
    });
  }

  // Fallback encoding if the web3 build omits Ed25519Program helpers.
  const numSignatures = 1;
  const padding = 0;
  const signatureOffset = 16;
  const signatureInstructionIndex = 0xffff;
  const publicKeyOffset = signatureOffset + 64;
  const publicKeyInstructionIndex = 0xffff;
  const messageDataOffset = publicKeyOffset + 32;
  const messageDataSize = message.length;
  const messageInstructionIndex = 0xffff;

  const header = new Uint8Array(16);
  header[0] = numSignatures;
  header[1] = padding;
  const view = new DataView(header.buffer);
  view.setUint16(2, signatureOffset, true);
  view.setUint16(4, signatureInstructionIndex, true);
  view.setUint16(6, publicKeyOffset, true);
  view.setUint16(8, publicKeyInstructionIndex, true);
  view.setUint16(10, messageDataOffset, true);
  view.setUint16(12, messageDataSize, true);
  view.setUint16(14, messageInstructionIndex, true);

  const data = new Uint8Array(messageDataOffset + message.length);
  data.set(header, 0);
  data.set(signature, signatureOffset);
  data.set(publicKeyBytes, publicKeyOffset);
  data.set(message, messageDataOffset);

  return new TransactionInstruction({
    keys: [],
    programId: new PublicKey(ED25519_PROGRAM_ID),
    data,
  });
}

function buildCreateCampaignIx(web3: SolanaWeb3Module, plan: SolanaV4GeneratedIdlInvocationPlan) {
  const { PublicKey, TransactionInstruction, SystemProgram } = web3;
  const a = plan.createCampaign.accounts;
  const data = encodeCreateCampaignData(plan.createCampaign.args);

  // Matches programs/memewarzone_solana CreateCampaign account metas (init PDAs are writable, not signers).
  const meta = (pubkey: string, isSigner: boolean, isWritable: boolean) => ({
    pubkey: new PublicKey(pubkey),
    isSigner,
    isWritable,
  });

  return new TransactionInstruction({
    programId: new PublicKey(plan.programId),
    keys: [
      meta(a.creator, true, true),
      meta(a.globalConfig, false, true),
      meta(a.generationConfig, false, false),
      meta(a.creatorProfile, false, true),
      meta(a.riskProfile, false, false),
      meta(a.clusterProfile, false, false),
      meta(a.campaign, false, true),
      meta(a.mint, false, true), // program-owned mint PDA (not external keypair signer)
      meta(a.tokenVault, false, true),
      meta(a.solVault, false, true),
      meta(a.createAuthorization, false, true),
      meta(a.instructions || SYSVAR_INSTRUCTIONS, false, false),
      meta(a.tokenProgram || TOKEN_PROGRAM, false, false),
      meta(a.systemProgram || SYSTEM_PROGRAM || SystemProgram.programId.toBase58(), false, false),
    ],
    data,
  });
}

export type SolanaV4CreateSubmitResult = {
  signature: string;
  campaignAddress: string;
  mintAddress: string;
  programId: string;
  plan: SolanaV4GeneratedIdlInvocationPlan | null;
  recovered?: boolean;
};

/**
 * Authorize response → wallet-signed V4 create transaction.
 */
export async function submitSolanaV4CreateFromAuthorization(
  authorization: SolanaV4CreateAuthorizationResponse,
  opts?: { creatorAddress?: string },
): Promise<SolanaV4CreateSubmitResult> {
  // Recovery: campaign PDA already exists for this draft (create succeeded earlier).
  if (authorization.alreadyOnChain || authorization.existingDeployment) {
    const campaignAddress =
      authorization.existingDeployment?.campaignAddress || authorization.accounts.campaign;
    const mintAddress = authorization.existingDeployment?.mintAddress || authorization.accounts.mint;
    return {
      signature: "already-on-chain",
      campaignAddress,
      mintAddress,
      programId: authorization.programId,
      plan: null as unknown as SolanaV4GeneratedIdlInvocationPlan,
      recovered: true,
    };
  }

  const plan = buildSolanaCreateCampaignV4Plan(authorization);
  return submitSolanaV4CreatePlan(plan, opts);
}

export async function submitSolanaV4CreatePlan(
  plan: SolanaV4GeneratedIdlInvocationPlan,
  opts?: { creatorAddress?: string },
): Promise<SolanaV4CreateSubmitResult> {
  const provider = getSolanaProvider();
  if (!provider?.publicKey || typeof provider.signTransaction !== "function") {
    throw new Error("Connect a Solana wallet that can sign transactions (e.g. Phantom).");
  }

  const creatorPk = String(provider.publicKey.toString?.() || provider.publicKey || "");
  if (opts?.creatorAddress && creatorPk && opts.creatorAddress !== creatorPk) {
    // base58 is case-sensitive — do not lowercase
    if (String(opts.creatorAddress).trim() !== creatorPk) {
      throw new Error("Connected Solana wallet does not match the draft creator.");
    }
  }
  if (plan.createCampaign.accounts.creator && plan.createCampaign.accounts.creator !== creatorPk) {
    throw new Error("Authorization creator account does not match the connected Solana wallet.");
  }

  const web3 = await loadSolanaWeb3();
  const { Connection, Transaction, PublicKey, ComputeBudgetProgram } = web3;
  const rpc =
    String(import.meta.env.VITE_SOLANA_RPC || "").trim() ||
    getPublicRpcUrl(SOLANA_CHAIN_ID) ||
    "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const campaignPk = new PublicKey(plan.createCampaign.accounts.campaign);
  const mintPk = new PublicKey(plan.createCampaign.accounts.mint);
  const programPk = new PublicKey(plan.programId);

  // Preflight: deterministic PDAs may already exist from a prior successful create
  // that failed to mark the draft (would otherwise sim-fail with InvalidCampaign).
  // Create order is mint → vault → campaign; catch mint-only partials too.
  const existing = await connection.getMultipleAccountsInfo([campaignPk, mintPk], "confirmed");
  if (existing[0] && existing[0].owner.equals(programPk)) {
    return {
      signature: "already-on-chain",
      campaignAddress: plan.createCampaign.accounts.campaign,
      mintAddress: plan.createCampaign.accounts.mint,
      programId: plan.programId,
      plan,
      recovered: true,
    };
  }
  if (existing[1] && existing[1].owner.equals(new PublicKey(TOKEN_PROGRAM))) {
    throw new Error(
      "Solana create blocked: mint PDA already exists but campaign account is empty (partial prior create). " +
        "Retry will keep failing — use a new draft or ask ops to reclaim the mint PDA.",
    );
  }

  const ed25519Ix = buildEd25519VerifyIx(web3, plan);
  const createIx = buildCreateCampaignIx(web3, plan);

  const tx = new Transaction();
  try {
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  } catch {
    // optional
  }
  // Ed25519 must immediately precede createCampaign (program invariant).
  tx.add(ed25519Ix);
  tx.add(createIx);

  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = new PublicKey(creatorPk);
  tx.recentBlockhash = latest.blockhash;

  // Soft size guard (Solana max ~1232 bytes).
  try {
    const estimated = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length;
    if (estimated > 1200) {
      console.warn("[solanaV4CreateSubmit] large transaction", estimated);
    }
  } catch {
    // ignore estimate failures
  }

  const signed = await provider.signTransaction(tx);
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  } catch (error: unknown) {
    // Race: another tab/create landed between preflight and send.
    const msg = formatSolanaSendError(error);
    if (/InvalidCampaign|already in use|account.*exist/i.test(msg)) {
      const again = await connection.getAccountInfo(campaignPk, "confirmed");
      if (again && again.owner.equals(programPk)) {
        return {
          signature: "already-on-chain",
          campaignAddress: plan.createCampaign.accounts.campaign,
          mintAddress: plan.createCampaign.accounts.mint,
          programId: plan.programId,
          plan,
          recovered: true,
        };
      }
    }
    throw new Error(msg);
  }

  return {
    signature,
    campaignAddress: plan.createCampaign.accounts.campaign,
    mintAddress: plan.createCampaign.accounts.mint,
    programId: plan.programId,
    plan,
  };
}

/** Collapse wallet/RPC simulation dumps into a short operator-readable message. */
function formatSolanaSendError(error: unknown): string {
  const anyErr = error as {
    message?: string;
    logs?: string[];
    getLogs?: () => string[] | Promise<string[]>;
  };
  const message = String(anyErr?.message || error || "Solana transaction failed.");
  const logs = Array.isArray(anyErr?.logs) ? anyErr.logs : [];
  // Some wallets only embed logs in the message string.
  const combined = `${logs.join("\n")}\n${message}`;

  if (/InvalidCampaign|Campaign data is invalid/i.test(combined)) {
    return (
      "Solana create failed (InvalidCampaign): campaign/mint PDAs already exist from a prior create. " +
      "Hard-refresh and retry Push Live — authorize recovery will link the existing campaign (no re-create)."
    );
  }
  if (/InvalidCreateAuthorization/i.test(combined)) {
    return (
      "Solana create failed (InvalidCreateAuthorization): route digest mismatch or wallet/tx instruction order. " +
      "Ensure Ed25519 verify is immediately before createCampaign and retry."
    );
  }
  if (/CreatorCooldownActive/i.test(combined)) {
    return (
      "Solana create failed: creator launch cooldown is active on-chain. " +
      "If a prior create already landed, retry Push Live for recovery instead of a fresh create."
    );
  }

  const anchorLine =
    logs.find((line) => /AnchorError|Error Code:|Error Message:/i.test(line)) ||
    message.match(/Error Code:\s*[A-Za-z0-9_]+[^\n]*/i)?.[0];
  if (anchorLine) {
    const code = anchorLine.match(/Error Code:\s*([A-Za-z0-9_]+)/i)?.[1];
    const msg = anchorLine.match(/Error Message:\s*([^.]+)/i)?.[1];
    const account = anchorLine.match(/account:\s*([A-Za-z0-9_]+)/i)?.[1];
    const parts = ["Solana create simulation failed"];
    if (code) parts.push(code);
    if (account) parts.push(`account ${account}`);
    if (msg) parts.push(msg.trim());
    return parts.join(" — ");
  }

  // Prefer the first Program log line over the full “Catch SendTransactionError…” dump.
  const programLog = logs.find((line) => line.startsWith("Program log:"));
  if (programLog) return programLog.replace(/^Program log:\s*/i, "Solana program: ");

  if (/AccountDiscriminatorMismatch/i.test(message)) {
    return "Solana create failed: on-chain account layout does not match the deployed program (AccountDiscriminatorMismatch). Operator must upgrade/redeploy the program binary.";
  }
  if (/Simulation failed/i.test(message)) {
    const short = message.split(/Logs:/i)[0]?.trim() || message;
    return short.length > 280 ? `${short.slice(0, 277)}...` : short;
  }
  return message.length > 320 ? `${message.slice(0, 317)}...` : message;
}
