import { JsonRpcProvider, isAddress } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";

function firstEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function csvEnv(...names) {
  return firstEnv(...names)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values, normalizer = (value) => value) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = normalizer(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function bnbEnv(network, name) {
  const suffix = network.chainId === 97 ? "97" : "56";
  return firstEnv(
    `${name}_${suffix}`,
    `VITE_${name}_${suffix}`,
    ...(network.chainId === 56 ? [name, `VITE_${name}`] : []),
  );
}

function bnbRewardVaults(network) {
  return unique([
    bnbEnv(network, "COMMUNITY_REWARDS_VAULT_ADDRESS"),
    bnbEnv(network, "RECRUITER_REWARDS_VAULT_ADDRESS"),
  ].filter((value) => isAddress(value)), (value) => value.toLowerCase());
}

function bnbRpcUrls(network) {
  const suffix = network.chainId === 97 ? "97" : "56";
  return unique(csvEnv(`BSC_RPC_HTTP_${suffix}`, `VITE_PUBLIC_RPC_${suffix}`));
}

function solanaRewardVaults(network) {
  const names = network.chainId === 101
    ? ["SOLANA_DEVNET_REWARD_VAULT_ADDRESS", "SOLANA_REWARD_VAULT_ADDRESS"]
    : ["SOLANA_MAINNET_REWARD_VAULT_ADDRESS"];
  const values = names.map((name) => firstEnv(name)).filter(Boolean);
  return unique(values, (value) => value);
}

function solanaRpcUrls(network) {
  const names = network.chainId === 101
    ? ["SOLANA_DEVNET_RPC_HTTP", "SOLANA_RPC_HTTP"]
    : ["SOLANA_MAINNET_RPC_HTTP"];
  return unique(csvEnv(...names));
}

async function readBnbBalanceFromRpc(rpcUrl, addresses) {
  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  let total = 0n;
  for (const address of addresses) total += await provider.getBalance(address);
  return total;
}

async function readSolanaBalanceFromRpc(rpcUrl, addresses) {
  const connection = new Connection(rpcUrl, "confirmed");
  let total = 0n;
  for (const address of addresses) {
    const lamports = await connection.getBalance(new PublicKey(address), "confirmed");
    total += BigInt(lamports);
  }
  return total;
}

export function configuredRewardVaultAddresses(network) {
  if (network.chain === "bnb") return bnbRewardVaults(network);
  return solanaRewardVaults(network);
}

export async function readRewardFunding(network) {
  const addresses = configuredRewardVaultAddresses(network);
  const rpcUrls = network.chain === "bnb" ? bnbRpcUrls(network) : solanaRpcUrls(network);

  if (addresses.length === 0) {
    return {
      configured: false,
      readable: false,
      vaultCount: 0,
      fundedRaw: 0n,
      error: "Reward vault is not configured for the selected network.",
    };
  }
  if (rpcUrls.length === 0) {
    return {
      configured: true,
      readable: false,
      vaultCount: addresses.length,
      fundedRaw: 0n,
      error: "Reward funding RPC is not configured for the selected network.",
    };
  }

  let lastError = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const fundedRaw = network.chain === "bnb"
        ? await readBnbBalanceFromRpc(rpcUrl, addresses)
        : await readSolanaBalanceFromRpc(rpcUrl, addresses);
      return {
        configured: true,
        readable: true,
        vaultCount: addresses.length,
        fundedRaw,
        error: null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  return {
    configured: true,
    readable: false,
    vaultCount: addresses.length,
    fundedRaw: 0n,
    error: String(lastError?.message || lastError || "Reward funding balance read failed."),
  };
}
