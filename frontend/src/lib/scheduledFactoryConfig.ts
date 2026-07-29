import { ethers } from "ethers";

export const OBSOLETE_BSC_TESTNET_SCHEDULED_FACTORY = "0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6";

function env(name: string) {
  return String((import.meta.env as Record<string, unknown>)[name] || "").trim();
}

function validAddress(value?: string | null) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

function isObsoleteFactory(chainId: number, address: string) {
  return Number(chainId) === 97 && address.toLowerCase() === OBSOLETE_BSC_TESTNET_SCHEDULED_FACTORY.toLowerCase();
}

export function getScheduledFactoryAddress(chainId: number, genericFactoryAddress?: string | null) {
  const explicit = validAddress(
    env(`VITE_SCHEDULED_FACTORY_ADDRESS_${Number(chainId)}`) ||
      env(`VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS_${Number(chainId)}`) ||
      env("VITE_SCHEDULED_FACTORY_ADDRESS") ||
      env("VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS"),
  );
  const candidate = explicit || validAddress(genericFactoryAddress);
  if (!candidate || isObsoleteFactory(chainId, candidate)) return "";
  return candidate;
}
