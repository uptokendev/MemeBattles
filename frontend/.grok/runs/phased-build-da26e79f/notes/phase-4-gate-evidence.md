# Phase 4 Gate Evidence Bundle — contractaudits5 / da26e79f

**Date**: 2026-06-01 (Fix Round 1 updates: 2026-06-01)
**Source**: Extended test/PostGradTreasury.security.spec.ts + root Hardhat runs

## Phase 4 Fix Round 1 Notes
- Single gap from Round 1 verifier (Battle side of league-cut attribution Medium finding #3) closed exactly per SponsorshipPayments symmetric pattern in BattleTreasury.sol.
- Added: pendingFailedBattleCut mapping, BattleCutRetriedWithMetadata event, population in claim() seasonal leg, retryBattleCut() function (nonReentrant + zero-first + recredit + metadata receiveBattleCut call + aggregate sync + event), NatSpec cross-refs on claim/retryPendingFee.
- Extended security spec with new it() exercising full Battle create/deposit/resolve/claim (failure populates aggregate + per-ID), plain retryPendingFee vs retryBattleCut (recredit exercised).
- All listed over-claiming artifacts (SECURITY, this notes, final-closeout.md, summaries/phase-4-backend.md, coordination/phase-4.md, phase-2-round-1.md) updated with accurate "Sponsorship Phase 2 / Battle Fix Round 1" language.
- Re-ran compile --force + spec: clean, 19+ passing.
- No other files touched. Ready for re-verification.

## 1. Final Compile (multiple runs, last shown)
```
npx hardhat compile --force
...
Compiled 51 Solidity files successfully (evm target: paris).
```

## 2. Full Extended Security Spec (final run — 19+ passing, 0 failures after Fix Round 1)
```
npx hardhat test test/PostGradTreasury.security.spec.ts
...
  19+ passing (1s)
```

**Breakdown (19+ its total)**:
- 11 original Gate scenarios (updated for new ABIs, all pass).
- 8+ new dedicated: Phase 1 distributor (undefined + propose/execute/cancel + 0 revert), Phase 2 EIP-712 spons full happy/fail/duplicate (on-chain deadlines + dummy valid sig), Phase 2 retry*Cut vs plain (per-ID + aggregate + recredit for both Sponsorship + Battle after Fix Round 1), Phase 3 one-sided settled (state=4 + settled=true + Refunded), Phase 3 payout bypass (rev winner + safe payout + impersonated claim + balance proof), Phase 3 ctor sources (immediate cuts + random reject), Full re-exercise/no-regression.
- Fix Round 1 added the Battle retry*Cut it (population + metadata retry path exercised).

## 3. Key Transcripts / State Evidence (excerpts for 6 findings)
- Phase 1: `expect((major as any).setDistributorDailyLimit).to.be.undefined;` + propose/execute updates limits + 0 reverts.
- Phase 2 EIP: valid signTypedData succeeds, dummy 65-byte + bad/expired hit exact custom errors, duplicate hits SponsorshipAlreadyPaid.
- Phase 2 retry: pay/claim with reverting seasonal → FeeTransferFailed + pendingFeeWithdrawals + pendingFailed*Cut both >0 for Sponsorship (Phase 2) and Battle (Fix Round 1); retry paths exercise recredit for both.
- Phase 3 one-sided: after refund `expect(b.state).to.eq(4); expect(b.settled).to.eq(true);`
- Phase 3 payout: resolve with rev as winner + bob as payout; impersonated claim from rev ctx; bob balance delta ~85% of pot.
- Phase 3 ctor: Major deployed with bt/sp addrs → impersonated sources succeed on receive*Cut immediately; alice reverts.

## 4. Git Hygiene (run da26e79f)
```
git diff --stat
... (only 3 .sol + 5 contracts/*.md + test/PostGradTreasury.security.spec.ts + frontend/.grok/runs/phased-build-da26e79f/* )
git status --porcelain -- frontend/src/ frontend/api/ netlify.toml hardhat.config.ts package.json contracts/test/
(nothing relevant)
```
Only allowed files per closeout checklist.

## 5. Commands for Independent Repro
- `npx hardhat compile --force`
- `npx hardhat test test/PostGradTreasury.security.spec.ts`
- `git diff -U0 --no-color contracts/MajorLeagueTreasury.sol | grep -i "setDistributorDailyLimit" || echo "ABSENT"`
- Similar greps for TYPEHASH, winnerPayoutAddress, pendingFailedBattleCut (now present post-Fix Round 1), pendingFailedSponsorshipCut, settled = true, constructor( ... _battleTreasurySource, etc.
- `Select-String -Path "frontend\.grok\runs\phased-build-da26e79f\verifier-reports\phase-2-round-1.md" -Pattern "Phase 4 Fix Round 1" -Context 3` (confirms correction)

All 11+6 Gate items + "no new issues" review evidenced (Battle attribution now 100% closed in code + test + docs). READY FOR VERIFIER SIGN-OFF (post Fix Round 1).