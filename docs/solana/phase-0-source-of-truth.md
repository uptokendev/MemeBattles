# Solana Launchpad Source Of Truth

Status date: 2026-07-28
Base branch: `devpostgrad`
Implementation branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67
Plan source: revised MemeWarzone Solana Mainnet Combined Build Plan Version 2.1

## Current repository status

| Area | Current state | Readiness decision |
| --- | --- | --- |
| Solana wallet UX | Wallet detection/connect and signed-draft UX already exist in the shared frontend. | Preserve draft UX. Do not expose protocol-ready wording or live launch transactions yet. |
| Anchor workspace | A pinned Anchor 0.30.1 / Solana 1.18.26 / Rust 1.79 workspace is present, with classic SPL Token runtime support. | GitHub Actions is the build source of truth. |
| Global state | Split authorities, granular pauses, one-way security lock and one-active-generation identity exist. | Foundation implemented; deployment and authority ceremony remain pending. |
| Generation policy | `GenerationConfig` owns cluster kind, target allowlist, curve/supply economics, locked fees, DEX adapter and approved profile hashes. | Implemented and covered by Rust invariants; not deployed. |
| Creator and risk state | CreatorProfile, RiskProfile and ClusterProfile enforce tier, cooldown, live-count and restriction checks. | Foundation implemented; canonical sync jobs and admin controls remain pending. |
| Authorized create | Detached Ed25519 V3 verification through the Instructions sysvar replaces Railway transaction co-signing. | Program source implemented; Railway endpoint, generated-IDL client and transaction acceptance remain pending. |
| Timer/ticker/target binding | Create binds ticker hash, reservation ID/version, launch time and an allowlisted generation target. | On-chain shape implemented; canonical reservation database remains pending. |
| Program-controlled assets | Create derives and initializes the campaign, classic SPL mint, token vault and program-owned SOL vault; the full supply is minted to the vault and mint authority is revoked atomically. | Source and unit invariants implemented; local-validator and devnet account-state acceptance remain pending. |
| Campaign state | Campaign snapshots generation policy, derived asset addresses, token compartments, authority-revocation evidence, timer, reservation and accounting counters. | Bonding, graduation and validator-level asset tests remain pending. |
| IDL and deployment manifest | CI builds the program, generates the IDL, verifies both files, runs invariants and retains artifacts. | Build evidence only; no accepted deployment manifest or deployment yet. |
| Indexer/read models | No production Solana event indexer or generation-aware cursor is live. | Protocol reads remain pending. |
| Admin/dashboard | No production Solana generation, authority, DEX, treasury or seal operator dashboard is live. | Public launch controls remain disabled. |
| BNB/Topaz work | BNB and Topaz implementation continues independently on `devpostgrad`. | The Solana diff contains no BNB treasury, Topaz, contract or shared-production file changes. |

## Branch and merge decision

Historical PR #55 remains evidence only. It came from a stale divergent base and contained prototype frontend/backend transaction code that no longer matches the corrected authorization architecture.

PR #67 is the active implementation branch. `devpostgrad` is moving concurrently, so this PR deliberately keeps its diff Solana-only instead of copying changing base-branch files into the Solana branch. GitHub will combine the latest base at merge/rebase time.

## Non-negotiable launch gates

Solana create, buy, sell, graduation and reward claims remain disabled until all of these are true:

1. The Anchor program is deployed and paired with an accepted generated IDL and versioned deployment manifest.
2. Exactly one generation is active for creation while every supported historical generation remains tradable and graduatable.
3. GenerationConfig owns cluster kind, allowed targets, curve economics, fees, supply, decimals, route profiles, treasury profile, DEX profile and oracle policy.
4. The 6 USD tier is accepted only by a devnet generation; mainnet-beta rejects it on-chain.
5. Detached authorization is enforced for create and pre-graduation trading with domain separation, deadlines and replay protection.
6. Creator, wallet and cluster risk PDAs enforce tier limits, cooldowns, live campaign caps, creator buy lock/cap, restrictions and manual review.
7. Create derives the campaign mint and vaults, mints exactly the generation supply to program custody, has no freeze authority and permanently revokes mint authority.
8. Local-validator and devnet tests prove the real mint, token-vault and SOL-vault account states plus rejection of substituted accounts.
9. Graduation uses `net_raised_lamports`; direct transfers to the SOL vault never advance the threshold or increase sell solvency.
10. Dynamic USD graduation uses fresh SOL/USD oracle data and rejects stale or invalid prices.
11. Meteora DAMM v2 graduation, permanent principal lock, fee harvest and creator/protocol fee split pass acceptance; Raydium CPMM remains a compatible fallback adapter.
12. Jupiter is used only after graduation and cannot bypass pre-graduation bonding controls.
13. Treasury routing, weekly/monthly allocation, monthly cap, charity overflow, rewards and replay-safe claims exist program-side.
14. A generation-aware Solana indexer covers every supported generation from configured start slots and reconciles accounts, vaults, DEX locks, seals and rewards.
15. The operator dashboard exposes generation health, authorities, indexer cursors, DEX/locker state, monthly seals and multisig-safe admin payloads.
16. Devnet acceptance documents authorized and unauthorized flows, timer behavior, ticker reservation, asset initialization, graduation, liquidity lock, fee harvest, rewards, monthly seal, overflow, generation coexistence and manual interventions.
17. Final audit, simulation and monitoring gates have no unresolved Critical, High or Medium findings; accepted lower findings are documented; security defaults are locked before creation is enabled.

## BNB-to-Solana parity matrix

| Capability | Solana target | Current status |
| --- | --- | --- |
| Create | Detached route-authorized create through active GenerationConfig; creator signs the transaction, Railway signs only the payload. | V3 program source implemented; backend/generated-IDL client and validator acceptance pending. |
| Generation economics | Creator cannot choose curve, supply, fee, DEX, treasury or oracle policy. | Implemented in GenerationConfig and snapshotted into Campaign. |
| Program-controlled mint | Deterministic classic SPL mint, generation-owned supply/decimals, no freeze authority and permanent mint-authority revocation. | Implemented in create source and unit invariants; transaction-level proof pending. |
| Campaign token vault | Deterministic Campaign-PDA-controlled vault initially holds the complete supply and records curve/liquidity/reserve compartments. | Implemented in create source; buy/sell/graduation movement rules pending. |
| Campaign SOL vault | Deterministic program-owned PDA exists from create; raw lamports never define graduation or sell capacity. | Implemented in create source; settlement instructions and validator reconciliation pending. |
| Prepare Mode timer | Immediate launch or immutable scheduled launch; no trading before `launch_at`. | Create-time binding implemented; buy/sell enforcement pending. |
| Ticker reservation | Canonical database reservation plus authorization-bound ticker hash and reservation version. | On-chain binding implemented; database/API pending. |
| Graduation tier | Generation-owned exact allowlist, including devnet-only 6 USD and approved production tiers. | Implemented on-chain. |
| Buy | Authorized bonding buy with slippage, max cost, timer and risk checks. | Pending. |
| Sell | Authorized bonding sell with net-raised solvency and risk checks. | Pending. |
| Graduation | Fresh-oracle USD threshold, Meteora DAMM v2 primary adapter, permanent principal lock and fee harvest. | Pending. |
| DEX fallback | Raydium CPMM behind the same adapter boundary. | Adapter identity only. |
| Post-graduation swap | Jupiter quote/swap UX only after the DEX pool exists. | Pending. |
| Treasury and rewards | Program-owned SOL vaults, weekly/monthly routing, monthly cap, charity overflow and replay-safe claims. | Pending. |
| Indexer and reconciliation | Per-generation cursoring with account, vault, DEX, seal and reward reconciliation. | Pending. |
| Security/admin | Split authorities, multisig operations, locked defaults and complete audit trail. | On-chain authority foundation implemented; operational dashboard pending. |

## Account model

| Account | Purpose |
| --- | --- |
| GlobalConfig PDA | Authorities, granular pause flags, active generation ID and locked security defaults. |
| GenerationConfig PDA | Immutable generation identity, cluster/target policy, curve/supply economics, locked fees, DEX adapter, profile commitments and support/creation state. |
| Campaign PDA | Generation-bound policy snapshot, asset identities, token compartments, timer, ticker/reservation, balances, creator restrictions and graduation state; signs approved token CPIs. |
| Campaign mint PDA | Classic SPL Token mint derived from campaign ID; exact supply minted once, no freeze authority and mint authority revoked. |
| Campaign token-vault PDA | SPL Token account controlled by Campaign PDA; initially holds the complete minted supply. |
| Campaign SOL-vault PDA | Program-owned Anchor account for campaign-native custody; protocol accounting remains separate from raw lamports. |
| CreateAuthorization PDA | Creator+nonce replay record, route signer, schema version, deadline, used timestamp and accepted payload hash. |
| CreatorProfile PDA | Creator tier, trust, launch counters, cooldown, buy lock/cap and restrictions. |
| RiskProfile PDA | Wallet-level risk, restriction, cluster and manual-review state. |
| ClusterProfile PDA | Cluster size, risk and restriction state. |
| TreasuryRouter PDA | Routing basis points, cap/overflow destinations and failed-payout retry state. |
| MonthlySeal PDA | Month, oracle price, cap, pool, overflow, charity transfer and sealing evidence. |
| DexState PDA | Adapter, pool, lock/position, principal, initial price, harvested fees and graduation evidence. |

## Current sign-off checklist

- [x] Current Solana repository status recorded.
- [x] Historical PR #55 classified as evidence rather than merge target.
- [x] Fresh implementation branch and draft PR created.
- [x] Solana-only foundation preserved without BNB/shared-file replacement.
- [x] Detached Ed25519 create authorization V3 implemented.
- [x] Timer, ticker reservation, target and risk bindings implemented.
- [x] Generation cluster/tier policy and economics implemented.
- [x] Creator-controlled mint, route and economics fields removed from create arguments.
- [x] Deterministic campaign, mint, token-vault and SOL-vault initialization implemented in source.
- [x] Full supply minting, token-compartment accounting and atomic mint-authority revocation implemented in source.
- [ ] Local-validator asset/account/authority transaction tests completed.
- [ ] Canonical reservation/backend/generated client implemented.
- [ ] Devnet acceptance completed.

The public Solana protocol remains `protocol_pending` until every launch gate above is closed.
