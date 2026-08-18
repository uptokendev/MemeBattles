# Finance network activation checklist

Finance supports four explicit network targets. No target falls back to another environment.

## BNB Testnet — chain 97

Before expecting all currently implemented controls to become live, configure/verify on the Railway Frontend API:

- `BSC_RPC_HTTP_97`
- `FACTORY_ADDRESS_97`
- `TREASURY_ROUTER_ADDRESS_97`
- `PROTOCOL_REVENUE_VAULT_ADDRESS_97`
- `COMMUNITY_REWARDS_VAULT_ADDRESS_97`
- `RECRUITER_REWARDS_VAULT_ADDRESS_97`
- `PERMANENT_LP_LOCKER_ADDRESS_97`
- `VOTE_TREASURY_ADDRESS_97`
- `REWARD_DISTRIBUTOR_ADDRESS_97` or an approved `FINANCE_REWARD_CUSTODY_ADDRESSES_97`

Revenue additionally checks the deployed UP Vote Treasury on-chain. Native paid-upvote revenue is admitted only when `UPVoteTreasury.feeReceiver()` equals `PROTOCOL_REVENUE_VAULT_ADDRESS_97`.

## BNB Mainnet — chain 56

Use the equivalent `_56` variables. Leave them unset until mainnet deployment and sign-off. An undeployed mainnet is expected to show pending/blocked controls rather than using testnet data.

Native paid-upvote revenue uses the same live `feeReceiver()` ownership check on chain 56.

## Solana Devnet — Finance chain 101

Configure/verify:

- `SOLANA_DEVNET_RPC_HTTP` or approved `SOLANA_RPC_HTTP` fallback
- `SOLANA_DEVNET_PROTOCOL_TREASURY_ADDRESS`
- `FINANCE_REWARD_CUSTODY_ADDRESSES_101` when claim custody is approved
- optional compatibility `SOLANA_DEVNET_REWARD_VAULT_ADDRESS`
- approved LP operator / Indexer configuration used by the existing LP authority

Current Solana reward claims are disabled in the application claim flow, so reward funding remains blocked until a real approved claim-custody surface is supplied. Do not use the LP operator wallet as reward custody merely to clear the control.

## Solana Mainnet — Finance chain 102

Configure mainnet-specific values only after production deployment:

- `SOLANA_MAINNET_RPC_HTTP`
- `SOLANA_MAINNET_PROTOCOL_TREASURY_ADDRESS`
- `FINANCE_REWARD_CUSTODY_ADDRESSES_102`
- optional compatibility `SOLANA_MAINNET_REWARD_VAULT_ADDRESS`
- mainnet LP operator / Indexer configuration

No devnet identity is inherited by mainnet.

## Current live Finance control dependencies

### Inventory

Reads approved public deployment identities only. It does not return balances, private RPCs, or secrets.

### Revenue

BNB currently supports:

1. exact TreasuryRouter trade `protocol_amount` from canonical `reward_events`;
2. cumulative LP protocol share through the existing LP authority;
3. confirmed native paid-upvote amounts only after the live UP Vote `feeReceiver()` matches the approved Protocol Revenue Vault.

Solana currently supports LP harvest evidence only. Its current LP record is discrete last-harvest evidence, not a fabricated lifetime cumulative total.

### Rewards

Coverage is native-asset only for now. Outstanding obligation is `allocated + claimable + pending`. Funded amount is the readable approved claim-custody balance. Non-native reward assets remain excluded until decimals and custody are pinned.

### Reconciliation

Currently combines reward claim-custody coverage with realtime Indexer LP health/freshness. It does not claim that all treasury/protocol balances are fully reconciled yet.

### Overview

Composes Inventory, Revenue-source, Rewards and Reconciliation status server-side. Costs, Tax & Reserves, Close and Distributions remain disabled and therefore keep Close at `not_ready`.

## Do not bypass blocked controls

A blocked state caused by missing custody, missing RPC, undeployed mainnet contracts, disabled Solana claims, or an unapproved revenue destination is expected behavior. Fix the underlying deployment/configuration or accounting rule; do not add a frontend override that re-labels unknown data as ready.
