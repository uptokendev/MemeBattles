#!/usr/bin/env node
import { Connection, PublicKey } from "@solana/web3.js";

const PROGRAM_ID_FALLBACK = "2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX";
const RPC = String(
  process.env.SOLANA_REWARDS_RPC_URL ||
  process.env.SOLANA_REWARDS_RPC_URL_102 ||
  process.env.SOLANA_RPC_URL_102 ||
  process.env.SOLANA_RPC_URL ||
  "",
).trim();
const PROGRAM_ID = new PublicKey(
  String(process.env.SOLANA_REWARDS_TREASURY_PROGRAM_ID || PROGRAM_ID_FALLBACK).trim(),
);

function fail(message) {
  throw new Error(`[solana-rewards-devnet] ${message}`);
}

function pda(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], PROGRAM_ID)[0];
}

function ownerString(info) {
  return info?.owner?.toBase58?.() || null;
}

async function fetchRequired(connection, label, address, minimumDataLength = 0) {
  const info = await connection.getAccountInfo(address, "confirmed");
  if (!info) fail(`${label} is missing at ${address.toBase58()}`);
  if (!info.owner.equals(PROGRAM_ID)) {
    fail(`${label} owner mismatch: ${ownerString(info)} expected ${PROGRAM_ID.toBase58()}`);
  }
  if (minimumDataLength && info.data.length < minimumDataLength) {
    fail(`${label} data is too small: ${info.data.length} expected >= ${minimumDataLength}`);
  }
  return info;
}

async function main() {
  if (!RPC) fail("SOLANA_REWARDS_RPC_URL is required");

  const connection = new Connection(RPC, "confirmed");
  const version = await connection.getVersion();
  const program = await connection.getAccountInfo(PROGRAM_ID, "confirmed");
  if (!program) fail(`program is not deployed at ${PROGRAM_ID.toBase58()}`);
  if (!program.executable) fail(`program account ${PROGRAM_ID.toBase58()} is not executable`);

  const addresses = {
    rewardsConfig: pda("rewards_config"),
    leagueVault: pda("league_vault"),
    airdropVault: pda("airdrop_vault"),
    routeState: pda("route_state"),
    protocolVault: pda("protocol_vault"),
    monthlyLeagueVault: pda("monthly_league_vault"),
    recruiterVault: pda("recruiter_vault"),
    squadVault: pda("squad_vault"),
  };

  const config = await fetchRequired(connection, "RewardsConfig", addresses.rewardsConfig, 44);
  const authority = new PublicKey(config.data.subarray(8, 40));
  const claimsEnabled = config.data[43] === 1;

  const routeState = await fetchRequired(connection, "RouteState", addresses.routeState, 121);
  const routeAuthority = new PublicKey(routeState.data.subarray(8, 40));
  const operator = new PublicKey(routeState.data.subarray(40, 72));
  const overflowTreasury = new PublicKey(routeState.data.subarray(72, 104));
  if (!routeAuthority.equals(authority)) {
    fail(`RouteState authority ${routeAuthority.toBase58()} does not match RewardsConfig authority ${authority.toBase58()}`);
  }
  if (!overflowTreasury.equals(addresses.protocolVault)) {
    fail(`RouteState overflow treasury ${overflowTreasury.toBase58()} does not match protocol vault ${addresses.protocolVault.toBase58()}`);
  }

  const vaultLabels = [
    ["League vault", addresses.leagueVault],
    ["Airdrop vault", addresses.airdropVault],
    ["Protocol vault", addresses.protocolVault],
    ["Monthly League vault", addresses.monthlyLeagueVault],
    ["Recruiter vault", addresses.recruiterVault],
    ["Squad vault", addresses.squadVault],
  ];

  const rentMinimum = await connection.getMinimumBalanceForRentExemption(9, "confirmed");
  const vaults = {};
  for (const [label, address] of vaultLabels) {
    const info = await fetchRequired(connection, label, address, 9);
    vaults[label] = {
      address: address.toBase58(),
      lamports: info.lamports,
      rentMinimum,
      distributableLamports: Math.max(0, info.lamports - rentMinimum),
    };
  }

  const result = {
    ok: true,
    cluster: "devnet",
    solanaCore: version["solana-core"] || null,
    programId: PROGRAM_ID.toBase58(),
    programExecutable: program.executable,
    programOwner: program.owner.toBase58(),
    rewardsConfig: addresses.rewardsConfig.toBase58(),
    authority: authority.toBase58(),
    claimsEnabled,
    routeState: addresses.routeState.toBase58(),
    operator: operator.toBase58(),
    protocolVault: addresses.protocolVault.toBase58(),
    vaults,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
