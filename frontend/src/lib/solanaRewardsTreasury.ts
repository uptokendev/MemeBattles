import { SOLANA_CHAIN_ID } from "@/lib/chainConfig";

export const REWARDS_TREASURY_PROGRAM_ID = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
export const LEAGUE_VAULT_SEED = "league_vault";
export const AIRDROP_VAULT_SEED = "airdrop_vault";
export const REWARDS_CONFIG_SEED = "rewards_config";
export const LEAGUE_EPOCH_SEED = "league_epoch";
export const LEAGUE_CLAIM_SEED = "league_claim";
export const LEAGUE_LEAF_PREFIX = "MWZ_LEAGUE_LEAF";
export const LEAGUE_FEE_BPS = 75;
export const AIRDROP_FEE_BPS = 50;

export const PERIOD_WEEKLY = 0;
export const PERIOD_MONTHLY = 1;

export function rewardsTreasuryProgramId(): string {
  return (
    String(import.meta.env.VITE_SOLANA_REWARDS_TREASURY_PROGRAM_ID || "").trim() ||
    REWARDS_TREASURY_PROGRAM_ID
  );
}

export async function deriveRewardsVaults(programId = rewardsTreasuryProgramId()) {
  const { PublicKey } = await import("@solana/web3.js");
  const pid = new PublicKey(programId);
  const [leagueVault] = PublicKey.findProgramAddressSync([Buffer.from(LEAGUE_VAULT_SEED)], pid);
  const [airdropVault] = PublicKey.findProgramAddressSync([Buffer.from(AIRDROP_VAULT_SEED)], pid);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from(REWARDS_CONFIG_SEED)], pid);
  return {
    programId,
    leagueVault: leagueVault.toBase58(),
    airdropVault: airdropVault.toBase58(),
    config: config.toBase58(),
    chainId: SOLANA_CHAIN_ID,
  };
}

export function periodCode(period: string): number {
  return String(period || "").toLowerCase() === "monthly" ? PERIOD_MONTHLY : PERIOD_WEEKLY;
}
