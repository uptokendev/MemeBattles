import { ethers } from "ethers";

export type FactoryInventoryInput = {
  chainId: number;
  rpcHttp: string;
  activeFactoryAddress?: string;
  activeFactoryStartBlock?: number;
  supportedFactoryAddresses?: string[];
  supportedFactoryStartBlocks?: number[];
};

export type SupportedFactory = {
  chainId: number;
  rpcHttp: string;
  address: string;
  startBlock: number;
  isActiveCreationFactory: boolean;
  cursor: string;
};

export function normalizeFactoryAddress(value: string | undefined | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!ethers.isAddress(raw)) {
    throw new Error(`Invalid factory address: ${raw}`);
  }
  return ethers.getAddress(raw).toLowerCase();
}

export function factoryCursor(address: string): string {
  const normalized = normalizeFactoryAddress(address);
  if (!normalized) throw new Error("Factory address is required for cursor generation");
  return `factory:${normalized}`;
}

export function buildFactoryInventory(input: FactoryInventoryInput): SupportedFactory[] {
  const entries = new Map<string, SupportedFactory>();
  const supportedAddresses = input.supportedFactoryAddresses || [];
  const supportedStartBlocks = input.supportedFactoryStartBlocks || [];

  const add = (addressValue: string | undefined, startBlockValue: number | undefined, isActive: boolean) => {
    const address = normalizeFactoryAddress(addressValue);
    if (!address) return;

    const parsedStart = Number(startBlockValue || 0);
    const startBlock = Number.isFinite(parsedStart) && parsedStart > 0 ? Math.floor(parsedStart) : 0;
    const existing = entries.get(address);

    if (existing) {
      existing.isActiveCreationFactory = existing.isActiveCreationFactory || isActive;
      if (existing.startBlock === 0 && startBlock > 0) existing.startBlock = startBlock;
      return;
    }

    entries.set(address, {
      chainId: input.chainId,
      rpcHttp: input.rpcHttp,
      address,
      startBlock,
      isActiveCreationFactory: isActive,
      cursor: factoryCursor(address),
    });
  };

  supportedAddresses.forEach((address, index) => add(address, supportedStartBlocks[index], false));
  add(input.activeFactoryAddress, input.activeFactoryStartBlock, true);

  return Array.from(entries.values()).sort((a, b) => {
    if (a.isActiveCreationFactory !== b.isActiveCreationFactory) {
      return a.isActiveCreationFactory ? -1 : 1;
    }
    return a.startBlock - b.startBlock || a.address.localeCompare(b.address);
  });
}
