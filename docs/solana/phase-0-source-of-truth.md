# Solana Launchpad Source of Truth

Status date: 2026-07-28
Base branch: `devpostgrad`
Implementation branch: `agent/solana-v2-phase0-refresh`
Draft PR: #67
Plan source: revised MemeWarzone Solana Mainnet Combined Build Plan Version 2.1

## Current repository status

| Area | Current state | Readiness decision |
| --- | --- | --- |
| Solana wallet UX | Wallet detection/connect and signed-draft UX already exist in the shared frontend. | Preserve draft UX. Do not expose protocol-ready wording or live launch transactions yet. |
| Anchor workspace | A pinned Anchor 0.30.1 / Solana 1.18.26 / Rust 1.79 workspace is present on the refreshed branch. | GitHub Actions is the build source of truth. |
| Global and generation state | Global authorities, granular pauses, one-way security lock and one-active-generation support registry exist. | Foundation implemented; generation-owned economics and cluster/tier policy remain pending. |
| Creator and risk state | CreatorProfile, RiskProfile and ClusterProfile foundations enforce tier, cooldown, live-count and restriction checks. | Foundation implemented; canonical sync jobs and admin controls remain pending. |
| Authorized create | Detached Ed25519 payload verification through the Instructions sysvar replaces Railway transaction co-signing. | Compiles and passes Rust invariants; backend endpoint, generated-IDL client and transaction tests remain pending. |
| Timer/ticker/tier binding | Campaign create binds ticker hash, reservation ID/version, launch time, graduation target and profile IDs. | On-chain shape implemented. Canonical reservation database and generation tier mask remain pending. |
| Campaign state | Campaign stores generation, creator, mint, metadata, timer, target, profile bindings, creator lock/cap and net-raised counters. | Mint/vault initialization and bonding instructions remain pending. |
| IDL and deployment manifest | GitHub Actions builds the program, generates and verifies the IDL, runs Rust invariants and retains the `.so` plus IDL as a 14-day artifact. | The artifact is build evidence only. No frontend transaction client may go live until a versioned deployment manifest and accepted deployment are paired with it. |
| Indexer/read models | No production Solana event indexer or generation-aware cursor is live. | Protocol reads remain pending. |
| Admin/dashboard | No production Solana authority, generation, DEX, treasury or seal operator dashboard is live. | Public launch controls remain disabled. |
| BNB/Topaz work | BNB and Topaz implementation continues independently. | The refreshed Solana diff does not replace BNB contracts, Topaz routing or shared production files with historical versions. |

## Branch and merge decision

Historical PR #55 is retained as evidence only. It was built from a stale, heavily divergent base and contained prototype frontend/backend transaction code that no longer matched the corrected authorization design.

The current implementation is a clean port of the validated Solana-only foundation onto the latest observed `devpostgrad` merge base. Unsafe prototype client files were not ported.

## Non-negotiable launch gates

Solana create, buy, sell, graduation and reward claims remain disabled until all of these are true:

1. The Anchor program is implemented, built, deployed and paired with an accepted generated IDL and versioned deployment manifest.
2. Exactly one generation is active for creation while every supported historical generation remains tradable and graduatable.
3. GenerationConfig owns cluster kind, allowed graduation tiers, curve economics, fees, supply, decimals, route profiles, treasury profiles, DEX profile and oracle policy.
4. The 6 USD tier is accepted only by a devnet generation. Mainnet-beta generations reject it on-chain.
5. Detached authorization is enforced for create and authorized pre-graduation trade actions with domain separation, deadlines and replay protection.
6. Creator, wallet and cluster risk PDAs enforce tier limits, cooldowns, live campaign caps, creator buy lock/cap, restrictions and manual review.
7. Mint creation, mint authority, token vault and SOL vault ownership are guaranteed by the program.
8. Graduation uses `net_raised_lamports`; direct transfers to the SOL vault never advance the threshold.
9. Dynamic USD graduation uses fresh SOL/USD oracle data and rejects stale or invalid prices.
10. Meteora DAMM v2 graduation, permanent principal lock, fee harvest and creator/protocol fee split pass acceptance; Raydium CPMM remains a compatible fallback adapter.
11. Jupiter is used only after graduation and cannot bypass pre-graduation bonding controls.
12. Treasury routing, weekly/monthly allocation, monthly cap, charity overflow, rewards and replay-safe claims exist program-side.
13. A generation-aware Solana indexer covers every supported generation from configured start slots and reconciles accounts, vaults, DEX locks, seals and rewards.
14. The operator dashboard exposes generation health, authorities, indexer cursors, DEX/locker state, monthly seals and multisig-safe admin payloads.
15. Devnet acceptance documents authorized and unauthorized flows, timer behavior, ticker reservation, graduation, liquidity lock, fee harvest, rewards, monthly seal, overflow, generation coexistence and manual interventions.
16. Final audit, simulation and monitoring gates have no unresolved Critical, High or Medium findings; accepted lower findings are documented; security defaults are locked before creation is enabled.

## BNB-to-Solana parity matrix

| Capability | Solana target | Current status |
| --- | --- | --- |
| Create | Detached route-authorized create through the active GenerationConfig; creator signs the transaction, Railway signs only the payload. | Foundation implemented; backend/generated-IDL client/mint/vault path pending. |
| Prepare Mode timer | Immediate launch or immutable scheduled launch; no trading before `launch_at`. | Create-time binding implemented; buy/sell enforcement pending. |
| Ticker reservation | Canonical database reservation plus authorization-bound ticker hash and reservation version. | On-chain binding implemented; database/API pending. |
| Graduation tier | Generation-owned exact tier allowlist, including devnet-only 6 USD and approved production tiers. | Production tier checks exist; generation cluster/tier mask pending. |
| Buy | Authorized bonding buy with slippage, max cost, route profile, timer and risk checks. | Pending. |
| Sell | Authorized bonding sell with net-raised solvency and risk checks. | Pending. |
| Graduation | Fresh-oracle USD threshold, Meteora DAMM v2 primary adapter, permanent principal lock and fee harvest. | Pending. |
| DEX fallback | Raydium CPMM behind the same adapter boundary. | Interface constant only. |
| Post-graduation swap | Jupiter quote/swap UX only after the DEX pool exists. | Pending. |
| Treasury and rewards | Program-owned SOL vaults, weekly/monthly routing, monthly cap, charity overflow and replay-safe claims. | Pending. |
| Indexer and reconciliation | Per-generation cursoring with account, vault, DEX, seal and reward reconciliation. | Pending. |
| Security/admin | Split authorities, multisig operations, locked defaults and complete audit trail. | On-chain authority foundation implemented; operational dashboard pending. |

## Account model

| Account | Purpose |
| --- | --- |
| GlobalConfig PDA | Authorities, granular pause flags, active generation ID and locked security defaults. |
| GenerationConfig PDA | One immutable generation identity plus support/creation state; economics and cluster/tier policy are the next extension. |
| Campaign PDA | Generation-bound campaign state, timer, ticker/reservation, target, routes, balances, creator restrictions and graduation state. |
| CreateAuthorization PDA | Creator+nonce replay record, route signer, deadline, used timestamp and accepted payload hash. |
| CreatorProfile PDA | Creator tier, trust, launch counters, cooldown, buy lock/cap and restrictions. |
| RiskProfile PDA | Wallet-level risk, restriction, cluster and manual-review state. |
| ClusterProfile PDA | Cluster size, risk and restriction state. |
| Vault PDAs | Campaign token/SOL, weekly league, monthly treasury, charity, recruiter, squad, community, creator and protocol balances. |
| TreasuryRouter PDA | Routing basis points, cap/overflow destinations and failed-payout retry state. |
| MonthlySeal PDA | Month, oracle price, cap, pool, overflow, charity transfer and sealing evidence. |
| DexState PDA | Adapter, pool, lock/position, principal, initial price, harvested fees and graduation evidence. |

## Current sign-off checklist

- [x] Current Solana repository status recorded.
- [x] Historical PR #55 classified as evidence rather than merge target.
- [x] Fresh branch created from current `devpostgrad`.
- [x] Valid Solana-only foundation ported without historical BNB/shared-file replacement.
- [x] Detached Ed25519 create authorization implemented.
- [x] Timer, ticker reservation, target and profile bindings added to create payload/state.
- [x] Existing Anchor build and Rust invariant lane green on the corrected authorization commit.
- [x] IDL-generating artifact lane green.
- [ ] Generation cluster/tier policy and economics implemented.
- [ ] Mint/vault initialization implemented.
- [ ] Canonical reservation/backend/client path implemented.
- [ ] Local-validator and devnet acceptance completed.

The public Solana protocol remains `protocol_pending` until the launch gates above are closed.
