import type {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { SolanaWeb3Module } from "@/lib/solanaWeb3";

export const SOLANA_PACKET_LIMIT_BYTES = 1_232;
export const SOLANA_RELEASE_MAX_BYTES = 1_000;

export type LaunchpadV0BuildInput = {
  payer: string | PublicKey;
  recentBlockhash: string;
  instructions: TransactionInstruction[];
  lookupTableAccounts?: AddressLookupTableAccount[];
};

export type LaunchpadV0EnvelopeStats = {
  serializedBytes: number;
  requiredSigners: number;
  instructionCount: number;
  lookupTableCount: number;
  lookupWritableCount: number;
  lookupReadonlyCount: number;
};

export type LaunchpadV0IntentExpectation = {
  payer: string | PublicKey;
  ed25519Instruction: TransactionInstruction;
  programInstruction: TransactionInstruction;
  lookupTableAccounts?: AddressLookupTableAccount[];
  hardMaxBytes?: number;
  releaseMaxBytes?: number | null;
};

function keyString(value: string | { toBase58?: () => string; toString?: () => string }): string {
  if (typeof value === "string") return value;
  if (typeof value?.toBase58 === "function") return value.toBase58();
  return String(value?.toString?.() || "");
}

function dataEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function instructionEqual(a: TransactionInstruction, b: TransactionInstruction): boolean {
  if (keyString(a.programId) !== keyString(b.programId)) return false;
  if (!dataEqual(a.data, b.data)) return false;
  if (a.keys.length !== b.keys.length) return false;
  for (let i = 0; i < a.keys.length; i += 1) {
    const left = a.keys[i];
    const right = b.keys[i];
    if (keyString(left.pubkey) !== keyString(right.pubkey)) return false;
    if (left.isSigner !== right.isSigner || left.isWritable !== right.isWritable) return false;
  }
  return true;
}

export function buildLaunchpadV0Transaction(
  web3: SolanaWeb3Module,
  input: LaunchpadV0BuildInput,
): VersionedTransaction {
  const { PublicKey: Web3PublicKey, TransactionMessage, VersionedTransaction: Web3VersionedTransaction } = web3;
  const payerKey = typeof input.payer === "string" ? new Web3PublicKey(input.payer) : input.payer;
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: input.recentBlockhash,
    instructions: input.instructions,
  }).compileToV0Message(input.lookupTableAccounts || []);
  return new Web3VersionedTransaction(message);
}

export function inspectLaunchpadV0Envelope(
  web3: SolanaWeb3Module,
  transaction: VersionedTransaction,
  lookupTableAccounts: AddressLookupTableAccount[] = [],
): LaunchpadV0EnvelopeStats {
  const decompiled = web3.TransactionMessage.decompile(transaction.message, {
    addressLookupTableAccounts: lookupTableAccounts,
  });
  let lookupWritableCount = 0;
  let lookupReadonlyCount = 0;
  for (const lookup of transaction.message.addressTableLookups) {
    lookupWritableCount += lookup.writableIndexes.length;
    lookupReadonlyCount += lookup.readonlyIndexes.length;
  }
  return {
    serializedBytes: transaction.serialize().length,
    requiredSigners: transaction.message.header.numRequiredSignatures,
    instructionCount: decompiled.instructions.length,
    lookupTableCount: transaction.message.addressTableLookups.length,
    lookupWritableCount,
    lookupReadonlyCount,
  };
}

export function assertLookupTableContains(
  lookupTable: AddressLookupTableAccount,
  requiredAddresses: Array<string | PublicKey>,
): void {
  const present = new Set(lookupTable.state.addresses.map((address) => address.toBase58()));
  const missing = requiredAddresses
    .map((address) => keyString(address))
    .filter((address) => !present.has(address));
  if (missing.length) {
    throw new Error(`Solana launchpad ALT is missing required addresses: ${missing.join(", ")}`);
  }
}

export async function fetchAndVerifyLaunchpadLookupTable(
  web3: SolanaWeb3Module,
  connection: Connection,
  input: {
    address: string;
    requiredAddresses?: Array<string | PublicKey>;
    expectedAuthority?: string | PublicKey;
  },
): Promise<AddressLookupTableAccount> {
  const address = new web3.PublicKey(input.address);
  const result = await connection.getAddressLookupTable(address);
  const table = result.value;
  if (!table) throw new Error(`Solana launchpad ALT not found: ${input.address}`);
  if (typeof table.isActive === "function" && !table.isActive()) {
    throw new Error(`Solana launchpad ALT is deactivated: ${input.address}`);
  }
  if (input.expectedAuthority) {
    const actualAuthority = table.state.authority?.toBase58?.() || "";
    if (actualAuthority !== keyString(input.expectedAuthority)) {
      throw new Error(
        `Solana launchpad ALT authority mismatch: ${actualAuthority || "none"} != ${keyString(input.expectedAuthority)}`,
      );
    }
  }
  if (input.requiredAddresses?.length) {
    assertLookupTableContains(table, input.requiredAddresses);
  }
  return table;
}

export function assertLaunchpadV0Intent(
  web3: SolanaWeb3Module,
  transaction: VersionedTransaction,
  expectation: LaunchpadV0IntentExpectation,
): LaunchpadV0EnvelopeStats {
  const lookupTableAccounts = expectation.lookupTableAccounts || [];
  const stats = inspectLaunchpadV0Envelope(web3, transaction, lookupTableAccounts);
  const hardMaxBytes = expectation.hardMaxBytes ?? SOLANA_PACKET_LIMIT_BYTES;
  const releaseMaxBytes = expectation.releaseMaxBytes === undefined
    ? SOLANA_RELEASE_MAX_BYTES
    : expectation.releaseMaxBytes;

  if (stats.requiredSigners !== 1) {
    throw new Error(`Solana launchpad V0 requires exactly one signer; got ${stats.requiredSigners}`);
  }
  if (stats.serializedBytes > hardMaxBytes) {
    throw new Error(`Solana launchpad V0 transaction is ${stats.serializedBytes} bytes; hard max is ${hardMaxBytes}`);
  }
  if (releaseMaxBytes != null && stats.serializedBytes > releaseMaxBytes) {
    throw new Error(
      `Solana launchpad V0 transaction is ${stats.serializedBytes} bytes; release max is ${releaseMaxBytes}`,
    );
  }

  const payer = transaction.message.staticAccountKeys[0];
  if (!payer || payer.toBase58() !== keyString(expectation.payer)) {
    throw new Error("Solana launchpad V0 fee payer changed before signing/submission");
  }

  const decompiled = web3.TransactionMessage.decompile(transaction.message, {
    addressLookupTableAccounts: lookupTableAccounts,
  });
  const targetProgramId = keyString(expectation.programInstruction.programId);
  const programIndices = decompiled.instructions
    .map((instruction, index) => keyString(instruction.programId) === targetProgramId ? index : -1)
    .filter((index) => index >= 0);

  if (programIndices.length !== 1) {
    throw new Error(`Expected exactly one MemeWarzone instruction; found ${programIndices.length}`);
  }
  const programIndex = programIndices[0];
  const actualProgramInstruction = decompiled.instructions[programIndex];
  if (!instructionEqual(actualProgramInstruction, expectation.programInstruction)) {
    throw new Error("MemeWarzone instruction intent changed before signing/submission");
  }
  if (programIndex === 0) {
    throw new Error("Detached Ed25519 authorization is missing before MemeWarzone instruction");
  }
  const previousInstruction = decompiled.instructions[programIndex - 1];
  if (!instructionEqual(previousInstruction, expectation.ed25519Instruction)) {
    throw new Error("Detached Ed25519 authorization must remain immediately before MemeWarzone instruction");
  }
  return stats;
}

export async function simulateLaunchpadV0Transaction(
  connection: Connection,
  transaction: VersionedTransaction,
  options: { sigVerify?: boolean; commitment?: "processed" | "confirmed" | "finalized" } = {},
) {
  return connection.simulateTransaction(transaction, {
    commitment: options.commitment || "confirmed",
    sigVerify: options.sigVerify ?? false,
    replaceRecentBlockhash: false,
  });
}
