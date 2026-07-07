# devpostgrad Solana Recruiter Compatibility Audit

Audit date: 2026-07-07
Base branch: `devpostgrad`
Reference branch: `dev`
Scope: recruiter signup, recruiter portal, wallet context, Solana wallet support, signup/auth/recruiter APIs, rewards, payouts, database expectations, environment variables, and upload endpoints.

`devpostgrad` remains the source of truth. The `dev` branch is used only as a reference for proven Solana wallet onboarding and Phantom signing behavior.

| Area | Existing in both | Only in `dev` | Only in `devpostgrad` | Conflicts | Safe merges / action |
| --- | --- | --- | --- | --- | --- |
| Recruiter signup | Both branches expose a recruiter signup route and capture recruiter identity fields. | Solana-oriented signup componentization and Phantom-first wallet handling. | Current recruiter signup is integrated with PostGrad recruiter status, code availability, nonce, and the canonical recruiter API. | A file-level copy from `dev` would replace the newer PostGrad-aware form. | Keep `devpostgrad` form and extend it with Solana signing only. Completed in PR #36 and consolidated through `useRecruiterWallet` in this branch. |
| Recruiter portal | Both branches have recruiter-facing authenticated areas. | Basic Solana auth expectations. | Advanced portal session, squad image management, code editing, native payout balances, payout wallet verification, and claim creation. | `dev` portal code is less complete and would drop payout/reward behavior. | Preserve `devpostgrad` portal. Extend auth/signature verification for Solana while keeping one portal. Completed in PR #36. |
| Wallet context | Both branches have EVM wallet connection logic. | Dedicated Solana wallet detection/signing helpers from Phantom/Solflare-style providers. | BNB-only EIP-6963 wallet selection, chain guardrails, attribution sync, and Command Center integration. | Multiple components made local BNB-vs-Solana decisions differently. | Add shared recruiter wallet abstraction that exposes active wallet, chain, address, connect, disconnect, and signMessage. Added in this branch. |
| Solana wallet support | Both branches can detect wallet-related browser state. | Solana provider helpers and Phantom message signing. | Existing app-level providers, route structure, and PostGrad UI shell. | Phantom EVM must not be treated as the BNB wallet. | Preserve BNB wallet constraints and use dedicated Solana provider for Solana signing. Completed in PR #36 and shared hook follow-up. |
| Signup APIs | Both branches have recruiter signup concepts. | Solana signup nonce and signature verification behavior. | Canonical `/api/recruiters/signup/*` API attached to existing recruiter schema and fallback behavior. | Duplicate Solana signup endpoints would split lifecycle state. | Extend canonical signup endpoints. Completed in PR #36. No duplicate endpoint required. |
| Recruiter APIs | Both support recruiter lookup/status behavior. | Solana address lookup expectations. | Recruiter leaderboard, wallet summary, referral capture, attribution, squad membership, rewards, portal, and payout APIs. | Solana addresses are case-sensitive/base58, while EVM lookup is lower-case. | Keep canonical endpoints and use address-aware matching. Completed in PR #36 for signup/status/attribution and portal lookup. |
| Authentication | Both use wallet signatures. | Phantom Ed25519 signature flow. | Recruiter portal session cookie/bearer token and existing EVM verification. | EVM `ethers.verifyMessage` cannot verify Solana signatures. | Keep one nonce/session flow and branch only at crypto verification. Completed in PR #36. |
| Reward routing | Both branches have recruiter reward intent. | No newer PostGrad reward routing source of truth. | Canonical recruiter reward ledgers, wallet rewards, squad/recruiter attribution, and Command Center reward surfaces. | Copying `dev` would regress reward routes. | Preserve `devpostgrad` reward routes. No Solana-specific duplicate route needed. |
| Payout routing | Both branches may identify recruiter wallets. | Solana wallet signature support. | Native BNB/SOL payout balances, payout wallet verification, claim creation, and portal-backed session access. | Payout wallet verification must sign with the payout wallet chain, not assume EVM. | Preserve payout system and use shared wallet signing for BNB/Solana. Backend completed in PR #36; frontend consolidated in this branch. |
| Database expectations | Both expect recruiter wallet storage. | Solana wallet addresses must preserve base58 casing. | Existing `recruiters`, `auth_nonces`, `wallet_*`, `recruiter_accounts`, `recruiter_payout_wallets`, reward ledger, and claim tables. | Lower-casing Solana addresses breaks lookup and uniqueness assumptions. | Do not add parallel Solana tables. Store Solana wallet in canonical fields/metadata and use case-aware lookup. PR #36 adjusted lookups; no SQL required unless production unique indexes force lower-case expression indexes. |
| Environment variables | Both use app/API runtime env. | Solana support does not require new required env vars for signup/auth. | Existing `RECRUITER_PORTAL_SESSION_SECRET`, session/JWT fallbacks, database vars, feature flags, and PostGrad flags. | Introducing new mandatory env vars would make existing deployment brittle. | No new required env vars. Existing secrets remain valid. |
| Upload endpoints | Both support user/recruiter media upload paths. | Solana address compatibility expectation. | Existing upload path routing for avatars/squad images. | EVM normalization of all wallet paths corrupts Solana public keys. | Preserve Solana case and only lower-case EVM addresses. Completed in PR #36. |

## Completion Notes

- BNB recruiter signup/auth remains on the existing EVM signature path.
- Solana recruiter signup/auth uses the same recruiter endpoints and portal session, with Ed25519 verification isolated to the cryptographic layer.
- The recruiter portal, reward ledger, payout wallet verification, and claim creation remain unified across BNB and Solana.
- This branch adds the missing frontend abstraction layer so recruiter-facing UI no longer has separate ad hoc wallet selection behavior.

## Remaining Validation Required

Run full browser/backend E2E validation in an environment with dependencies, database, and wallets available:

1. BNB signup, login, portal access, code edit, squad image upload, referral attribution, rewards, payout wallet link, and claim creation.
2. Solana signup, Phantom connect, login, portal access, code edit, squad image upload, referral attribution, rewards, payout wallet link, and claim creation.
3. Regression check for existing recruiter accounts and PostGrad Command Center routes.
