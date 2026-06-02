# PostGrad Treasury User Interaction Guide

... (original content)

**contractaudits5 / phased-build-da26e79f — Complete (2026-06-01)**: All 6 findings + prior 11-item Gate closed. Full EIP-712 sponsorship authorization (when authorizer set), attribution-preserving retry*Cut, winner payoutAddress in signed resolutions, one-sided settled consistency, and Major ctor source init now live and exercised in the Phase 4 security spec (19 passing its). See SECURITY_AUDIT_REPORT.md Phase 4 mapping + final-closeout.md. Original subsections for Phase 2/3 flows remain the authoritative integration guide.

**contractaudits8 — Complete**: Unsigned sponsorship removed (always EIP-712 + non-zero authorizer at deploy; see SponsorshipPayments NatSpec). New recovery: Sponsorship/Battle propose*CutRedirect (owner timelock 2d) to retarget stuck historical receiver on a specific per-ID pending cut (use before calling retry*Cut). Major: prefer claimRewardTo(poolId, yourPayout) if your reward address cannot receive ETH (claimReward still works for EOAs). Battle: if a winner payout is pending and both addresses reject, resolver can issue replaceWinnerPayout (EIP-712) to set a new delivery address for claimWinnerPayout. All documented in the contracts' NatSpec. 19/19 tests. No new user-facing trust changes.

(End of appended note.)