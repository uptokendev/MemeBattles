# Finance reward custody configuration

The Finance API compares canonical native-asset reward obligations with approved reward custody balances. These reads happen only on the Railway Frontend API. Custody addresses and RPC URLs are not returned to the dashboard Finance read model.

## BNB Chain

BNB Testnet uses chain ID `97`; BNB Mainnet uses chain ID `56`.

Reward custody addresses are read from the existing deployment variables:

- `COMMUNITY_REWARDS_VAULT_ADDRESS_97`
- `RECRUITER_REWARDS_VAULT_ADDRESS_97`
- `COMMUNITY_REWARDS_VAULT_ADDRESS_56`
- `RECRUITER_REWARDS_VAULT_ADDRESS_56`

`VITE_...` variants are accepted only as compatibility fallbacks because these addresses are public contract identities. Duplicate vault addresses are counted once.

Balance reads use CSV RPC failover from:

- `BSC_RPC_HTTP_97`
- `BSC_RPC_HTTP_56`

`VITE_PUBLIC_RPC_97` / `VITE_PUBLIC_RPC_56` are read-only compatibility fallbacks. Production should prefer server-only `BSC_RPC_HTTP_*` values.

## Solana

Solana Devnet uses Finance chain ID `101`; Solana Mainnet uses Finance chain ID `102`.

Reward custody must be configured explicitly and must not reuse the LP operator wallet merely because that wallet already exists:

- Devnet: `SOLANA_DEVNET_REWARD_VAULT_ADDRESS`
- Devnet compatibility fallback: `SOLANA_REWARD_VAULT_ADDRESS`
- Mainnet: `SOLANA_MAINNET_REWARD_VAULT_ADDRESS`

RPC configuration:

- Devnet: `SOLANA_DEVNET_RPC_HTTP`
- Devnet compatibility fallback: `SOLANA_RPC_HTTP`
- Mainnet: `SOLANA_MAINNET_RPC_HTTP`

A missing reward-vault identity or missing/unreadable RPC produces `coverageStatus: blocked`. It never becomes a funded amount of zero by assumption.

## Obligation definition

For the first custody pass, outstanding native-asset reward obligation is the sum of canonical `reward_ledger` rows normalized to these states:

- `allocated`
- `claimable`
- `pending`

Rows normalized to `claimed`, `expired`, or `returned` are not outstanding obligations.

Only native BNB/SOL rows are admitted to this coverage calculation. Non-native reward tokens are intentionally excluded until token-specific decimals and custody identities are mapped. This prevents applying BNB's 18 decimals or SOL's 9 decimals to unrelated assets.

## Reconciliation semantics

`finance-reconciliation-v1` currently combines:

- approved Finance inventory coverage,
- reward custody readability,
- native reward funding vs outstanding obligation,
- LP source errors and freshness from the realtime Indexer.

`balancedInventoryCount` should be interpreted as the number of tracked surfaces that currently have a passing balance/control check, not proof that every protocol balance has been fully ledger-reconciled.

A shortfall produces a funding break. Missing/unreadable custody configuration blocks reconciliation. Other treasury/protocol surfaces remain in `attention` until their expected-vs-observed balance rules are mapped.

## Mainnet readiness

Mainnet variables should remain unset until the corresponding contracts/programs are deployed and approved. The Finance network selector can still select mainnet; the correct result before deployment is blocked/unconfigured data, never automatic fallback to testnet/devnet.
