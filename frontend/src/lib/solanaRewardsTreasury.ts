import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";

export const REWARDS_TREASURY_PROGRAM_ID = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
export const LEAGUE_VAULT_SEED = "league_vault";
export const AIRDROP_VAULT_SEED = "airdrop_vault";
export const RECRUITER_VAULT_SEED = "recruiter_vault";
export const SQUAD_VAULT_SEED = "squad_vault";
export const REWARDS_CONFIG_SEED = "rewards_config";
export const LEAGUE_EPOCH_SEED = "league_epoch";
export const LEAGUE_CLAIM_SEED = "league_claim";
export const AIRDROP_BATCH_SEED = "airdrop_batch";
export const AIRDROP_CLAIM_SEED = "airdrop_claim";
export const RECRUITER_BATCH_SEED = "recruiter_batch";
export const RECRUITER_CLAIM_SEED = "recruiter_claim";
export const SQUAD_BATCH_SEED = "squad_batch";
export const SQUAD_CLAIM_SEED = "squad_claim";
export const LEAGUE_LEAF_PREFIX = "MWZ_LEAGUE_LEAF";
export const AIRDROP_LEAF_PREFIX = "MWZ_AIRDROP_LEAF";
export const RECRUITER_LEAF_PREFIX = "MWZ_RECRUITER_LEAF";
export const SQUAD_LEAF_PREFIX = "MWZ_SQUAD_LEAF";
export const LEAGUE_FEE_BPS = 75;
export const AIRDROP_FEE_BPS = 50;

export const PERIOD_WEEKLY = 0;
export const PERIOD_MONTHLY = 1;

export type SolanaRewardLane = "recruiter" | "squad";

export function rewardsTreasuryProgramId(): string {
  return (
    String(import.meta.env.VITE_SOLANA_REWARDS_TREASURY_PROGRAM_ID || "").trim() ||
    REWARDS_TREASURY_PROGRAM_ID
  );
}

function i64le(value: string | number | bigint): Buffer {
  let n = BigInt(value);
  if (n < 0n) n = (1n << 64n) + n;
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) {
    out[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return out;
}

export async function deriveRewardsVaults(programId = rewardsTreasuryProgramId()) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const [leagueVault] = PublicKey.findProgramAddressSync([Buffer.from(LEAGUE_VAULT_SEED)], pid);
  const [airdropVault] = PublicKey.findProgramAddressSync([Buffer.from(AIRDROP_VAULT_SEED)], pid);
  const [recruiterVault] = PublicKey.findProgramAddressSync([Buffer.from(RECRUITER_VAULT_SEED)], pid);
  const [squadVault] = PublicKey.findProgramAddressSync([Buffer.from(SQUAD_VAULT_SEED)], pid);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from(REWARDS_CONFIG_SEED)], pid);
  return {
    programId,
    leagueVault: leagueVault.toBase58(),
    airdropVault: airdropVault.toBase58(),
    recruiterVault: recruiterVault.toBase58(),
    squadVault: squadVault.toBase58(),
    config: config.toBase58(),
    chainId: SOLANA_CHAIN_ID,
  };
}

export async function deriveAirdropBatchPda(epochId: string | number | bigint, programId = rewardsTreasuryProgramId()) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(AIRDROP_BATCH_SEED), i64le(epochId)],
    pid,
  );
  return pda.toBase58();
}

export async function deriveAirdropClaimPda(
  epochId: string | number | bigint,
  programCode: number,
  winner: string,
  programId = rewardsTreasuryProgramId(),
) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(AIRDROP_CLAIM_SEED),
      i64le(epochId),
      Buffer.from([Number(programCode) & 0xff]),
      new PublicKey(winner).toBuffer(),
    ],
    pid,
  );
  return pda.toBase58();
}

export async function deriveRewardLaneBatchPda(
  lane: SolanaRewardLane,
  epochId: string | number | bigint,
  programId = rewardsTreasuryProgramId(),
) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const seed = lane === "recruiter" ? RECRUITER_BATCH_SEED : SQUAD_BATCH_SEED;
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from(seed), i64le(epochId)], pid);
  return pda.toBase58();
}

export async function deriveRewardLaneClaimPda(
  lane: SolanaRewardLane,
  epochId: string | number | bigint,
  winner: string,
  programId = rewardsTreasuryProgramId(),
) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const seed = lane === "recruiter" ? RECRUITER_CLAIM_SEED : SQUAD_CLAIM_SEED;
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(seed), i64le(epochId), new PublicKey(winner).toBuffer()],
    pid,
  );
  return pda.toBase58();
}

export function periodCode(period: string): number {
  return String(period || "").toLowerCase() === "monthly" ? PERIOD_MONTHLY : PERIOD_WEEKLY;
}
