export function normalizeEvmAddress(value) {
  const address = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : "";
}

export function normalizeEvmAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts
    .map((account) => normalizeEvmAddress(String(account)))
    .filter(Boolean);
}

export function selectEvmAccount(reportedAccounts, selectedAddress, fallbackAccounts = []) {
  const reported = normalizeEvmAccounts(reportedAccounts);
  if (reported[0]) return reported[0];

  const fallback = normalizeEvmAccounts(fallbackAccounts);
  const selected = normalizeEvmAddress(selectedAddress);
  if (selected && fallback.includes(selected)) return selected;

  return fallback[0] || "";
}
