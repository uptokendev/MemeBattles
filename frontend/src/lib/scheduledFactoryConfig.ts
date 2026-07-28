import { ethers } from "ethers";

export const BSC_TESTNET_SCHEDULED_FACTORY = "0xF7872169265eCE4E4C93ef894F1635E84DC6F681";

function env(name: string) {
  return String((import.meta.env as Record<string, unknown>)[name] || "").trim();
}

function validAddress(value?: string | null) {
  const raw = String(value || "").trim();
  return ethers.isAddress(raw) ? ethers.getAddress(raw) : "";
}

export function getScheduledFactoryAddress(chainId: number, genericFactoryAddress?: string | null) {
  const explicit = validAddress(
    env(`VITE_SCHEDULED_FACTORY_ADDRESS_${Number(chainId)}`) ||
      env(`VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS_${Number(chainId)}`) ||
      env("VITE_SCHEDULED_FACTORY_ADDRESS") ||
      env("VITE_SCHEDULED_LAUNCH_FACTORY_ADDRESS"),
  );
  if (explicit) return explicit;
  if (Number(chainId) === 97) return BSC_TESTNET_SCHEDULED_FACTORY;
  return validAddress(genericFactoryAddress);
}
