# Idea: Fix Remaining Security Issues in PostGrad Treasury Contracts (Pass 3 Audit)

## Background
We completed Security Audit Pass 3 (see `contractaudits3.md` in this folder) on the three PostGrad treasury contracts:
- `contracts/BattleTreasury.sol`
- `contracts/MajorLeagueTreasury.sol`
- `contracts/SponsorshipPayments.sol`

Most findings from Pass 1 and Pass 2 have been addressed through prior hardening (timelocks, non-blocking fees in battle path, proper revenue accounting via `receiveBattleCut`/`receiveSponsorshipCut`, EIP-712 struct expansion, distributor controls, refund safety for resolved battles, etc.).

Pass 3 identified that the system is much closer to safe, but two issues (one High severity) remain that must be fixed before any deployment or professional audit:

1. **High (Correctness)**: `BattleTreasury.resolveWinner` uses incorrect EIP-712 digest construction (double-wrapping the already-complete EIP-712 hash with `toEthSignedMessageHash`). Standard EIP-712 signing (ethers `signTypedData`, hardware wallets, etc.) will cause every `resolveWinner` call to fail with `InvalidSignature()`. Winners cannot claim; funds become stuck or force reliance on the refund hatch.

2. **Medium (Availability)**: `SponsorshipPayments.payForSponsorship` still uses blocking `require()` on protocol and league fee transfers. A misbehaving or temporarily unavailable fee receiver can prevent all sponsorship payments (unlike the hardened non-blocking pattern already used in Battle and MajorLeague).

Additional lower-severity operational improvements were noted (no timelock cancellation, immediate `setAuthorizedCreator` remains powerful, missing dedicated event on `receiveBattleCut`, stale compile error in unrelated legacy file).

These contracts hold user deposits and distribute real prize money. Fixes must be extremely careful.

## Goals
- Fix the EIP-712 signature digest bug in `BattleTreasury` so that standard EIP-712 signatures from the resolver succeed and `resolveWinner` works correctly.
- Apply the proven non-blocking fee transfer pattern (with `pendingFeeWithdrawals` + `claimPendingFees`) to `SponsorshipPayments` so that recipient payout cannot be blocked by protocol or league receiver behavior.
- Address the minor operational findings where they have clear security/ops benefit (e.g. timelock cancellation, dedicated event for battle cuts).
- Ensure all changes preserve existing behavior for happy paths, events, view functions, and the overall trust model documented in `contracts/TRUST_MODEL.md`.
- Produce clean, minimal diffs that a professional auditor can easily review.
- All changes must compile cleanly (fix the unrelated `LeagueTreasury.sol` syntax error as a drive-by if it blocks the pipeline, or isolate it).
- Update relevant documentation (TRUST_MODEL.md, SECURITY_AUDIT_REPORT.md, USER_INTERACTION_GUIDE.md, POSTGRAD_* docs) if behavior or assumptions change.

## Non-Goals / Out of Scope
- Full rewrite or major refactoring of the contracts.
- Adding new roles, factories, or on-chain dispute resolution.
- Changing fee percentages, splits, or economic parameters.
- Implementing multisig deployment scripts or key rotation procedures (those are ops, not code changes here).
- Comprehensive new test suite (we can add targeted tests for the fixed paths, but not a full audit-grade test campaign).
- Touching unrelated contracts (LeagueTreasury, existing TreasuryVault system, etc.) except the minimal drive-by to unblock compilation if required by the plan.
- Frontend or backend integration changes (unless a view function signature must change — avoid this).
- Gas optimizations unless they fall out naturally from the security fixes.

## Constraints
- Must follow the project's `AGENTS.md` (root) and any contract-specific guidance.
- Changes must be made only through the phased-build process with architect plan + verifier gate (no direct edits).
- Financial contracts: every money-moving path must remain reentrancy-safe, use checks-effects-interactions, and preserve the "pay user first, never block on fee receivers" principle.
- Signature change must remain compatible with existing off-chain resolver signing code (or the plan must explicitly call out the required off-chain update and provide example code).
- Timelock delay remains 2 days; do not change constants without explicit justification in the plan.
- Preserve all existing events and their signatures where possible. Add new events only when they improve auditability (e.g. dedicated battle cut event).
- The three contracts must continue to compile cleanly with the project's pinned OpenZeppelin v5 after changes.
- Any plan must include explicit verifier checklist items for: signature verification test (positive + negative cases), fee failure paths in sponsorship, no regression on existing claim/refund/allocate flows.

## Success Criteria
- The EIP-712 bug is completely eliminated; `resolveWinner` accepts correctly-formed EIP-712 signatures produced by standard libraries.
- Sponsorship payments succeed for the recipient even when protocol or league receivers revert or are unavailable; failed cuts are recorded in `pendingFeeWithdrawals` and claimable later.
- Verifier signs off that 100% of the closeout checklist items pass, including cross-contract integration and documentation updates.
- Git diff is minimal, well-commented, and ready for professional audit review.
- Updated `SECURITY_AUDIT_REPORT.md` (or a Pass 4 delta) reflects the fixes.
- No new high or critical issues introduced (verifier must explicitly check for this).

## References
- Primary input: `frontend/.grok/architect-feed/contractaudits3.md` (full Pass 3 findings + remediation recommendations)
- `contracts/BattleTreasury.sol`, `contracts/MajorLeagueTreasury.sol`, `contracts/SponsorshipPayments.sol`
- `contracts/TRUST_MODEL.md`
- `contracts/SECURITY_AUDIT_REPORT.md`
- `contracts/POSTGRAD_REVENUE_DECISION_TABLE.md`
- `contracts/USER_INTERACTION_GUIDE.md`
- Project `package.json` (OZ ^5.0.2) and `hardhat.config.ts`
- Root `AGENTS.md`

## Known Risks to Call Out in the Build Plan
- Any change to the signature hash construction requires coordination with the off-chain resolver (backend) that produces the signatures. The plan must include explicit steps or notes for this.
- The sponsorship change touches a live payment path; the non-blocking pattern must be implemented exactly as proven in the other two contracts.
- Compilation is currently broken project-wide due to a legacy file — the architect must decide whether fixing it is in scope or if we work around it (e.g. compile the three files in isolation for verification).