export function normalizeEvmAddress(value?: string | null): string;
export function normalizeEvmAccounts(accounts: unknown): string[];
export function selectEvmAccount(
  reportedAccounts: unknown,
  selectedAddress?: string | null,
  fallbackAccounts?: unknown,
): string;
