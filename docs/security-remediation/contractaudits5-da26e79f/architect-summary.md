# Architect Summary — phased-build-da26e79f

**Run Directory**: `frontend/.grok/runs/phased-build-da26e79f/`
**Run ID**: da26e79f

**Artifacts Produced** (this run):
- `idea.md` (input — full text of third audit / contractaudits5.md)
- `build-plan.md`
- `closeout-checklist.md`
- `architect-summary.md` (this file)

**Date**: 2026-06-01
**Idea Source**: `frontend/.grok/runs/phased-build-da26e79f/idea.md` (copy of contractaudits5.md)

---

## Analysis Summary (Post-Exploration)

All mandatory first steps completed before any planning artifacts were authored:
1. `frontend/AGENTS.md` read in full (mandatory non-negotiable rules on Netlify/Railway architecture, apiBase.ts centralization, no localhost hardcodes, and explicit "Local vs Production Impact" questions that every architect phase must answer).
2. `idea.md` (contractaudits5.md) read in full — 6 concrete remaining findings after the ec52d84a remediation of contractaudits4.md (High distributor limit bypass via immediate setter; Medium/High predictable-ID frontrunning on globally-unique sponsorshipId; Medium attribution loss on league-cut retryPendingFee; Low one-sided refund missing settled flag; Medium winner-claim permanent lock on rejecting contract; Low/Operational source addresses unset at deploy).
3. Current state of the three contracts inspected line-by-line (BattleTreasury.sol, MajorLeagueTreasury.sol, SponsorshipPayments.sol) with focus on setDistributorDailyLimit (still present at 211), PendingDistributorChange + propose/execute (147-184, 547+), payForSponsorship + sponsorshipPaid guard (214+, 292), retryPendingFee implementations (Battle 849, Major 436, Spons 393 — all plain .call{}""), one-sided refund path (607-640, specifically 629-631), claim winner payout (565-567), Battle struct (39-53), resolveWinner EIP-712 (461+ 486+), Major ctor (126-134), source vars + only* modifiers + PendingChange for sources (540-541, 503-511, 658+), receive*Cut (250, 285), and all Phase 3/5 comments referencing prior remediation.
4. Prior ec52d84a artifacts fully reviewed: build-plan.md, closeout-checklist.md, final-report.md, phase-5-round-1.md + final-closeout.md, notes/phase-5-gate-evidence.md, the 519-line test/PostGradTreasury.security.spec.ts (11 its covering the old 9-item Gate), all 5 contracts/*.md docs, and live code comments ("Phase 5:", "contractaudits4", "phased-build-ec52d84a").
5. TRUST_MODEL.md (v1.2, 2026-06-01 Phase 5 updates) and SECURITY_AUDIT_REPORT.md (contractaudits4 section declaring 11 findings + Gate closed) read for trust context and remaining immediate controls (only the 3 pauses).

**Key Constraints Observed (no deviations)**:
- Pure contract + docs + test work only. Zero changes under frontend/src/, api/, netlify.toml, hardhat.config.*, package.json, or any deployment scripts. All verification via Hardhat at repo root (`npm run compile`, `npx hardhat test test/PostGradTreasury.security.spec.ts`).
- Exact patterns from ec52d84a (and its Pass 3 precedent) must be followed: 2-day TIMELOCK_DELAY, Pending* structs + propose/execute/cancel trio + *Proposed/*Executed/*Cancelled events, nonReentrant + CEI + recredit-on-fail for all value sends, custom errors, full NatSpec, append-only storage only.
- Sponsorship auth change kept minimal/secure (EIP-712 modeled 1:1 on BattleTreasury's RESOLVE_WINNER flow + ECDSA import/using, new authorizer with its own timelocked Pending + propose/execute/cancel).
- Winner payout: signed payoutAddress added to the existing EIP-712 ResolveWinner payload (no new pull mapping).
- Retry metadata: specialized retryBattleCut(bytes32,bytes32) / retrySponsorshipCut(...) + per-ID pendingFailed*Cut mappings (append-only) so league cuts can re-deliver with metadata instead of plain-ETH unallocated.
- Sources: constructor initialization path added (2 new trailing params, 0 allowed + documented controlled-deploy alternative).
- One-sided refund: 1-line + comment to set settled=true (exact style of Phase 2 zeroing/settled work).
- Final gate section must re-exercise the full prior 11-item Deployment Gate Checklist + the 6 new findings (extended security spec + fresh transcripts).
- Every phase carries the exact N/A Local vs Production Impact block (no apiBase, no netlify, no Vite, no Railway impact).
- Out of scope strictly observed (no fee bps changes, no ERC20, no other contracts, no prod keys, no deployment scripts).

**Evidence of Exploration Rigor**:
- 30+ targeted reads + greps across contracts/*.sol (specific line ranges for every finding), test/PostGradTreasury.security.spec.ts, all run artifacts under phased-build-ec52d84a/, the 5 contracts/*.md docs, mocks/, and AGENTS.md.
- Code comments, event names, error strings, storage layouts, and NatSpec blocks cross-referenced against both the new idea.md and the prior remediation (e.g. "Phase 5: setMaxAllocationPerTx is now timelocked", exact "not battle treasury" modifier strings, FeeTransferFailed emit sites carrying IDs, etc.).
- No source edits performed; all planning is evidence-based on current post-ec52d84a state.

---

## One-Paragraph Phasing Overview + Rationale

This 4-phase plan directly remediates the 6 concrete findings in contractaudits5.md while re-validating the entire prior 11-item Gate from contractaudits4 (no regressions allowed). **Phase 1 (High)** isolates the single most dangerous remaining control bypass (immediate setDistributorDailyLimit undercutting the timelocked distributor proposal + per-distributor limits) by removing the direct setter entirely and replacing it with a new timelocked proposeDistributorLimitUpdate/execute/cancel flow (exact Pending* + events + nonzero enforcement pattern already proven for distributor changes and maxAllocationPerTx in ec52d84a Phase 3/5). **Phase 2 (Medium/High + Medium)** groups the two SponsorshipPayments-centric issues because they share the same file and require coordinated minimal EIP-712 addition (new authorizer role + timelocked setter + SponsorshipAuthorization typehash + verify helper copied verbatim from BattleTreasury's ECDSA pattern) plus the new per-ID pendingFailed*Cut mappings + specialized retry*Cut functions (the "richer structure + specialized retry" path explicitly called for in the audit to preserve battleId/sponsorshipId/poolId attribution on league cuts instead of plain-ETH unallocated). **Phase 3 (Medium + 2 Low/Operational)** handles the three BattleTreasury + cross-Major items that are independent of the sponsorship auth surface: extending the existing ResolveWinner EIP-712 payload with payoutAddress (preferred "signed payout address in the existing EIP-712 flow" per audit, stored in append-only Battle struct field, used in claim), the 1-line settled=true consistency fix in the one-sided refund branch, and constructor initialization for the two source addresses (plus NatSpec + deployment-sequence documentation). **Phase 4 (Global Gate + Docs + Spec)** is the mandatory closeout mirror of prior Phase 5: full 5-document sweep with dated "contractaudits5 / phased-build-da26e79f" notes, extension of test/PostGradTreasury.security.spec.ts with 7+ new its covering the 6 findings + happy-path regression + re-execution of all 11 prior Gate scenarios (now ~18-20 its total), collation in notes/phase-4-gate-evidence.md, clean re-runs of compile + the security spec, git-stat hygiene (only the 3 .sol + 5 .md + 1 test), and final-closeout.md + delta security review (reentrancy/CEI on the 2 new retry*Cut .call sites + winner payout call, pure EIP-712 verify, timelock + authorizer-sig + onlyOwner everywhere, append-only storage, no new griefing or stranding vectors). 

**Rationale for 4-phase (tight) grouping vs 2 or 3**: High-severity item isolated for early independent verification; sponsorship (auth + retry metadata) logically co-located to minimize EIP-712 surface area and new storage in one diff; Battle-specific + ctor hygiene grouped because they touch overlapping resolve/claim/refund/ctor paths; final gate phase required by prompt ("Include a final 'Global / Deployment Gate' closeout section that re-exercises the prior 11-item gate from contractaudits4 plus the new items") and precedent (ec52d84a Phase 5) to avoid repeated full-spec runs and to produce the single evidence bundle an independent verifier can use for 100% sign-off. All phases produce git-diff/grep/Hardhat-transcript evidence reproducible by a verifier agent with only a clean checkout + Hardhat.

**Next Step for User**: Review `build-plan.md` and `closeout-checklist.md` (and this summary) in `frontend/.grok/runs/phased-build-da26e79f/`. When ready, reply with explicit approval (or requested revisions) so the phased-build orchestrator can launch the Contract Implementer + Plan Verifier loop. All exploration, pattern extraction from ec52d84a, and AGENTS.md / constraint adherence was completed before any of the three planning documents were written. No .sol, .ts (test), or .md (contracts/) source was modified during this architect pass.

**Key References Embedded**:
- Full latest audit: `frontend/.grok/runs/phased-build-da26e79f/idea.md`
- Authoritative constraints: `frontend/AGENTS.md` (read first), prior ec52d84a build-plan/closeout-checklist/final-report + phase-5 verifier + notes/phase-5-gate-evidence.md, and the phased-build skill templates
- Source contracts (full current state + Phase 3/5 comments): `contracts/BattleTreasury.sol`, `contracts/MajorLeagueTreasury.sol`, `contracts/SponsorshipPayments.sol`
- Supporting docs (current post-ec52d84a): `contracts/TRUST_MODEL.md`, `contracts/SECURITY_AUDIT_REPORT.md`, `contracts/USER_INTERACTION_GUIDE.md`, `contracts/POSTGRAD_REVENUE_DECISION_TABLE.md`, `contracts/POSTGRAD_TREASURY_ARCHITECTURE.md`
- Verification surface: root `package.json` / Hardhat (compile + test/PostGradTreasury.security.spec.ts using RevertingReceiver/AcceptingReceiver mocks), existing timelock + EIP-712 + Pending* patterns

All rules respected. Ready for user decision. No deviations from "pure contract + docs + test", "exact ec52d84a patterns", or the 6 "Key findings from the idea you must address" enumerated in the task.