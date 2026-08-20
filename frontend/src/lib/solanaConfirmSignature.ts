/**
 * Block-height-aware confirmation for launchpad CREATE / BUY / SELL.
 * Expiry is currentHeight > lastValidBlockHeight, never a wall-clock guess.
 */

export const LAUNCHPAD_CONFIRM_POLL_MS = 1_500;
export const LAUNCHPAD_CONFIRM_HANG_TIMEOUT_MS = 120_000;

export class LaunchpadSignatureExpiredError extends Error {
  constructor(signature: string) {
    super(`Signature ${signature} expired: block height exceeded.`);
    this.name = "LaunchpadSignatureExpiredError";
  }
}

export class LaunchpadSignatureUnconfirmedError extends Error {
  constructor(signature: string) {
    super(
      `Solana RPC did not confirm signature ${signature} in time. Check the explorer before retrying.`,
    );
    this.name = "LaunchpadSignatureUnconfirmedError";
  }
}

export type LaunchpadConfirmConnection = {
  getSignatureStatuses: (
    signatures: string[],
    config?: { searchTransactionHistory?: boolean },
  ) => Promise<{ value?: Array<{ err?: unknown; confirmationStatus?: string | null } | null> }>;
  getTransaction?: (
    signature: string,
    config?: { commitment?: string; maxSupportedTransactionVersion?: number },
  ) => Promise<{ meta?: { err?: unknown } | null } | null>;
  getBlockHeight?: (commitment?: string) => Promise<number>;
};

export type LaunchpadConfirmInput = {
  signature: string;
  lastValidBlockHeight: number;
  recover?: () => Promise<boolean>;
  pollIntervalMs?: number;
  hangTimeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type LaunchpadConfirmResult = {
  err: unknown;
  recovered?: boolean;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConfirmedStatus(status: string | null | undefined): boolean {
  return status === "confirmed" || status === "finalized";
}

async function lookupTransaction(
  connection: LaunchpadConfirmConnection,
  signature: string,
): Promise<{ err: unknown } | null> {
  if (typeof connection.getTransaction !== "function") return null;
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return null;
  return { err: tx.meta?.err || null };
}

export async function confirmLaunchpadSignature(
  connection: LaunchpadConfirmConnection,
  input: LaunchpadConfirmInput,
): Promise<LaunchpadConfirmResult> {
  const signature = String(input.signature || "").trim();
  const lastValidBlockHeight = Number(input.lastValidBlockHeight);
  if (!signature) throw new Error("Missing Solana signature to confirm.");
  if (!Number.isFinite(lastValidBlockHeight) || lastValidBlockHeight <= 0) {
    throw new Error("Missing lastValidBlockHeight for Solana confirmation.");
  }

  const pollIntervalMs = input.pollIntervalMs ?? LAUNCHPAD_CONFIRM_POLL_MS;
  const hangTimeoutMs = input.hangTimeoutMs ?? LAUNCHPAD_CONFIRM_HANG_TIMEOUT_MS;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;
  const started = now();

  const finalizeMissing = async (): Promise<LaunchpadConfirmResult> => {
    const found = await lookupTransaction(connection, signature);
    if (found) return found;
    if (input.recover && (await input.recover())) return { err: null, recovered: true };
    throw new LaunchpadSignatureExpiredError(signature);
  };

  while (true) {
    if (now() - started >= hangTimeoutMs) {
      const found = await lookupTransaction(connection, signature);
      if (found) return found;
      if (input.recover && (await input.recover())) return { err: null, recovered: true };
      throw new LaunchpadSignatureUnconfirmedError(signature);
    }

    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const value = status?.value?.[0];
    if (value?.err) return { err: value.err };
    if (isConfirmedStatus(value?.confirmationStatus)) return { err: null };

    let currentHeight: number | null = null;
    if (typeof connection.getBlockHeight === "function") {
      try {
        currentHeight = await connection.getBlockHeight("confirmed");
      } catch {
        currentHeight = null;
      }
    }

    if (typeof currentHeight === "number" && currentHeight > lastValidBlockHeight) {
      return finalizeMissing();
    }

    await sleep(pollIntervalMs);
  }
}

export function isLaunchpadBlockhashError(value: unknown): boolean {
  return /blockhash not found|block height exceeded|expired blockhash/i.test(
    String((value as Error)?.message || value || ""),
  );
}

export const CREATE_EXPIRED_BEFORE_CONFIRMATION =
  "Transaction expired before confirmation. Nothing was charged / campaign was not created. Please retry.";

export const TRADE_EXPIRED_BEFORE_CONFIRMATION =
  "Transaction expired before confirmation. The trade was not executed. Please retry.";
