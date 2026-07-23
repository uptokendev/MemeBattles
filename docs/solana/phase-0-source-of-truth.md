# Solana Launchpad Phase 0 Source Of Truth

Status date: 2026-07-22
Base branch: devpostgrad
Plan source: 01-Solana-Implementation-Plan-For-MemeWarzone-Launchpad.docx

## Current Repo Status

| Area | Current state | Phase 0 decision |
| --- | --- | --- |
| Solana wallet UX | Solana wallet detection/connect and signed draft flow exist in the frontend. | Keep wallet connect live for drafts only. |
| Solana launch adapter | Frontend adapter scaffold exists and can derive placeholder PDAs/instruction payloads when a program ID is configured. | Treat as scaffold only until real Anchor program, IDL, indexer, dashboard, and devnet proof exist. |
| Solana program | No Anchor workspace or production IDL is present on devpostgrad. | On-chain create, buy, sell, graduation, and claim remain protocol_pending. |
| Solana indexer/read models | No Solana program event indexer or generation-aware cursor is present. | Public reads may show saved/indexed drafts only; no protocol-ready wording. |
| Solana admin/dashboard | No Solana generation, authority, indexer, DEX, treasury, or monthly seal operator dashboard exists. | Admin launch controls remain not available. |
| BNB/Topaz work | Active Topaz/treasury/generation work is ongoing in draft PRs against devpostgrad. | This slice avoids BNB contracts and shared Topaz files. |

## Non-Negotiable Launch Gates

Solana create, buy, sell, graduation, and reward claims must remain disabled until all of these are true:

1. Real Anchor program is implemented, built, deployed, and has a committed generated IDL.
2. Solana generation registry exists and supports exactly one active creation generation while preserving every supported generation for trading/graduation.
3. Route authorization is enforced for create and trade by default, with security defaults lockable and not weakenable after lock.
4. Creator, wallet, and cluster risk PDAs enforce tier limits, cooldowns, live campaign caps, creator buy lock/cap, restricted wallets, and manual review.
5. Graduation uses netRaisedLamports and excludes direct SOL transfers.
6. Dynamic USD graduation uses fresh SOL/USD oracle data and rejects stale/invalid prices.
7. Meteora DAMM v2 graduation, permanent principal lock, fee harvest, and creator/protocol fee split pass acceptance; Raydium CPMM remains adapter-compatible fallback.
8. Jupiter is used only after graduation and cannot bypass pre-graduation bonding controls.
9. Treasury routing, monthly cap, charity overflow, rewards, claims, recruiter/squad/community/creator/protocol vaults, and audit logs exist program-side.
10. Solana indexer covers every supported generation from configured start slots and reconciles program accounts, vault balances, DEX locks, monthly seals, and rewards roots.
11. Operator dashboard exposes Solana generation health, authority/multisig status, indexer cursors, DEX/locker status, monthly seal state, and multisig-safe admin payloads.
12. Devnet acceptance campaign documents authorized and unauthorized flows, graduation, liquidity lock, fee harvest, rewards, monthly seal, charity overflow, generation coexistence, values, invariants, deviations, and manual interventions.
13. Final audit/simulation/monitoring gate has no unresolved Critical/High/Medium findings, accepted lower findings are documented, and security defaults are locked before enabling creation.

## BNB To Solana Parity Matrix

| Capability | BNB target behavior | Solana parity target | Phase 0 status |
| --- | --- | --- | --- |
| Create | Route-authorized create through active factory/generation; creator supplies metadata only. | Route-authorized create through active GenerationConfig PDA; creator supplies metadata only. | Pending program/IDL. |
| Buy | Authorized pre-graduation bonding buy with slippage/max cost, risk checks, launch protection, pause flags. | Authorized bonding buy instruction with replay protection, route profile, wallet/cluster/creator checks, max buy/wallet, pause flags. | Pending program/IDL. |
| Sell | Authorized bonding sell with solvency based on net raised and pause/global safety model. | Authorized sell instruction with netRaisedLamports solvency and no direct SOL transfer accounting. | Pending program/IDL. |
| Graduation | Dynamic USD threshold, Topaz DEX graduation, principal lock, burns, fee harvest. | Dynamic USD threshold, Meteora DAMM v2 primary graduation, permanent principal lock, burns, fee harvest. | Pending program/DEX adapter. |
| DEX fallback | Topaz/BNB route is primary in current BNB plan. | Meteora primary; Raydium CPMM fallback through SolanaDexAdapter boundary. | Interface not implemented. |
| Post-grad swap UX | Swap UX is separate from bonding curve after graduation. | Jupiter quote/swap UX only after DEX pool exists. | Pending post-grad routing. |
| LP lock | PermanentLpLocker prevents principal withdrawal/rescue/migration. | Program-owned permanent lock proves principal cannot be withdrawn, approved out, migrated, or rescued. | Pending program/DEX integration. |
| Fee harvest | Harvest fees without reducing principal, split creator/protocol. | Harvest Meteora/Raydium-compatible fees without reducing principal, split creator/protocol, retry failed payouts. | Pending program/DEX integration. |
| Generations | One active creation generation, all supported generations visible/tradable/graduatable. | Same invariant via solana_program_generations and GenerationConfig PDA. | Schema/model pending. |
| Treasury | Weekly/monthly split and monthly cap/overflow behavior. | Program-side treasury router, weekly/monthly vaults, $1.5M cap, charity overflow. | Pending program/backend. |
| Rewards/claims | Separate reward ledgers and claim paths with replay protection. | SOL-native vault PDAs, replay-safe claims, batch/proof/reconciliation, no BNB/SOL accounting mix. | Pending program/backend. |
| Security/admin | Creator tiers, risk registry, route signer, pauser/admin controls, audit logs. | CreatorProfile/RiskProfile/ClusterProfile PDAs, admin authorities, lock_security_defaults, dashboard payloads, audit logs. | Pending program/admin. |
| Indexer | Generation-aware campaign/event reads and reconciliation. | Per-generation Solana indexer from startSlot with account/vault/DEX/monthly/rewards reconciliation. | Pending indexer. |
| Launch gates | BNB readiness depends on contracts, Topaz, env, tests, and acceptance. | Solana readiness requires program, IDL, generation registry, security PDAs, DEX, rewards, indexer, dashboard, monthly cap, charity overflow, and devnet acceptance. | Protocol pending. |

## Solana Account Model Draft

| Account | Purpose | Required fields |
| --- | --- | --- |
| GlobalConfig PDA | Chain-wide authorities and locked security defaults. | admin, pauser, tierAdmin, riskAdmin, routeSigner, rewardOperator, treasuryOperator, generationOperator, pause flags, route authorization required, authorized trading required, securityDefaultsLocked. |
| GenerationConfig PDA | One deployable launchpad generation configuration. | generationId, programId, configPda, startSlot, activeCreation, supportEnabled, dexAdapter, economics, route defaults, treasury config, oracle config, manifestHash. |
| Campaign PDA | Campaign state tied to original generation. | generationId, configPda, creator, mint, vaults, route profile, sold, netRaisedLamports, buy/sell volumes, buyer count, creator bought amount, graduation data, DEX state. |
| CreatorProfile PDA | Creator trust/tier limits and lifecycle counters. | tier, trustScore, liveBondingCount, lastLaunchTimestamp, totalLaunches, successfulGraduations, restricted, manualReviewRequired. |
| RiskProfile PDA | Wallet-level risk controls. | wallet, riskLevel, restricted, clusterId. |
| ClusterProfile PDA | Wallet-cluster risk controls. | clusterId, size, riskLevel, restricted. |
| Vault PDAs | Program-owned accounting and claims. | campaign SOL vault, token vault, weekly league vault, monthly treasury vault, charity treasury, recruiter, squad, community/airdrop, creator, protocol. |
| TreasuryRouter PDA | League/reward split and routing configuration. | weeklyBps, monthlyBps, charityTreasury, route states, failed payout retry state. |
| MonthlySeal PDA | One sealed monthly cap state. | monthId, oraclePrice, capUsd, capLamports, playerPool, overflow, charityTransfer, sealedAt, tx hash/reference. |
| DexState PDA | Graduation/lock/fee-harvest proof. | adapter, pool address, position/lock address, locked principal, initialDexPrice, fee totals, harvest cursor, graduation tx. |

## Phase 0 Sign-Off Checklist

- [x] Current Solana repo status recorded.
- [x] BNB-to-Solana parity matrix created.
- [x] Solana account model drafted before Anchor implementation.
- [x] Solana deployment/environment placeholder shape added.
- [x] Frontend Solana direct launch remains protocol_pending in the observed Create flow.
- [ ] Product/architecture sign-off received for this matrix.

Phase 1 may start only after the unchecked sign-off item is complete.
