# Phase 3 Coordination — BattleTreasury Settlement Robustness + Winner Payout Safety + Source Ctor Initialization

**Phase**: 3 of 4 (contractaudits5.md remediation — run da26e79f)
**Started**: 2026-06-01
**Status**: Phase 3 complete after Fix Round 2 — awaiting final verifier sign-off
**Phase 2 Status**: Implementer completed + "**Backend Phase 2 Ready for Verification**" posted (verifier launched)

## Phase Scope (exact excerpt from approved build-plan.md)

**Goal**: Address the remaining Battle + cross-Major findings:
- Medium: Winner claim permanent lock on rejecting contracts — add signed payoutAddress to existing ResolveWinner EIP-712 payload (stored in Battle struct, used in claim).
- Low: One-sided refund missing settled = true.
- Low/Operational: battleTreasurySource / sponsorshipPaymentsSource unset at deployment — add constructor initialization to MajorLeagueTreasury.

**Frontend Work**: None.

**Backend / Contract Work**:
- BattleTreasury.sol: Extend RESOLVE_WINNER_TYPEHASH + Battle struct with winnerPayoutAddress; update resolveWinner + claim to use it (0 = fallback to winner).
- BattleTreasury.sol: 1-line fix in one-sided refund to set settled = true.
- MajorLeagueTreasury.sol: Update constructor to accept two trailing source addresses (with 0 allowed + documented controlled deployment sequence).

**Deliverables**: All 3 findings closed with minimal, append-only, EIP-712-consistent changes + docs.

## Handoff Log

### Orchestrator — Backend Implementer (to be sent upon Phase 2 verifier PASS)
- Phase 2 verifier is expected to return shortly.
- When it returns READY TO CLOSE, Phase 3 is immediately authorized.
- You will be responsible for the exact Phase 3 slice (Battle + Major constructor + one doc updates only).
- Read build-plan.md Phase 3 + closeout-checklist Phase 3 before any edits.
- End with the literal marker "**Backend Phase 3 Ready for Verification**".

**Approved Plan Location**: frontend/.grok/runs/phased-build-da26e79f/build-plan.md
**Closeout Checklist Location**: frontend/.grok/runs/phased-build-da26e79f/closeout-checklist.md

(Phase 3 coordination pre-seeded for speed. Implementer will be launched the moment Phase 2 verifier returns READY TO CLOSE.)


### Backend Implementer Handoff + Fix Round 1 (2026-06-01 — addressing verifier phase-3-round-1.md PARTIAL PASS)
- Mandatory reads (build-plan Phase 3, closeout, this file, idea.md, 3 contracts, 5 docs) completed before edits.
- Exact scope: Battle TYPEHASH 9-field payout, struct append, resolve/claim updates + heavy NatSpec, one-sided settled + exact comment, NatSpec on refund/is*.
- Major ctor +2 sources + if-stores + NatSpec (0 for controlled sequence).
- 5 docs updated with dated Phase 3 / da26e79f notes (payout flow, settled consistency, ctor init).
- Strict pattern compliance + no scope expansion. Ready for compile + summary + marker.

### Phase 3 Fix Round 1 Notes (post-verifier, 2026-06-01)
- Addressed every item in 'Missing or Incomplete Work' and 'Deviations' from verifier report phase-3-round-1.md (PARTIAL PASS 11/17).
- USER_INTERACTION_GUIDE.md: Added the three exact required new subsections per checklist (Winner Payout Address in Signed Resolutions; One-Sided Refund now Consistent (settled flag); MajorLeagueTreasury Constructor Source Initialization).
- TRUST_MODEL.md: Updated resolver trust section (changed 8 fields to 9 fields + added payoutAddress bullet; updated mitigation text; payout designation note now under the section).
- BattleTreasury.sol: Added one-line Phase 3 consistency notes referencing the settled=true addition to NatSpec of refund(), isClaimable(), and isRefundable().
- All five docs: Cleaned encoding corruption (? and attle.settled) in Phase 3 note blocks; replaced with accurate clean text.
- SECURITY_AUDIT_REPORT.md: Rewrote Phase 3 Verification Evidence paragraph from template/future tense to actual executed evidence (compile runs, Select-String results, etc.).
- coordination + summaries: Expanded dated handoff notes, fixed status header, added literal marker.
- Final npx hardhat compile --force re-run: clean success. No other files or scope touched.

**Backend Phase 3 Ready for Verification**

**Backend Phase 3 Ready for Verification** (Phase 3 Fix Round 1 complete — all verifier gaps from phase-3-round-1.md addressed; compile clean)


### Phase 3 Fix Round 2 Notes (2026-06-01)
- Thoroughly cleaned **all** remaining encoding corruption in the Phase 3 note blocks of all five documents (USER_INTERACTION_GUIDE.md, TRUST_MODEL.md, SECURITY_AUDIT_REPORT.md, POSTGRAD_REVENUE_DECISION_TABLE.md, POSTGRAD_TREASURY_ARCHITECTURE.md): replaced the mangled escaped markdown (`\*\*...`), "attle.settled" (and control-char variants), � / ? replacement characters with clean, accurate text using proper markdown, correct spelling `battle.settled`, no escapes or replacement artifacts.
- In SECURITY_AUDIT_REPORT.md Phase 3 section: cleaned the header (removed �), fully revised the evidence paragraph for accuracy (removed "attle.settled" reference and the inaccurate prior claim "(corruption cleaned in fix round)"); now factual, references Fix Round 2 hygiene, uses `battle.settled` and clean language.
- Updated top-level **Status** header in this coordination file from the stale "Awaiting Phase 2 Verifier..." to reflect reality after Fix Round 2.
- Also cleaned residual ? artifacts in TRUST_MODEL.md resolver section Phase 3 payoutAddress text for complete hygiene.
- Re-ran `npx hardhat compile --force` at end of round (clean success, 51 files).
- Appended this Fix Round 2 section + final readiness marker. All changes strictly limited to the two remaining gaps from verifier round-2 report. No code, no Phase 4, no scope expansion.

**Backend Phase 3 Ready for Verification** (Phase 3 Fix Round 2 complete)