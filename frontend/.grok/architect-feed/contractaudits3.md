**Security Audit Pass 3 (Rerun)**

Scope: Current versions of `BattleTreasury.sol`, `MajorLeagueTreasury.sol`, and `SponsorshipPayments.sol` (as of latest on devpostgrad).

This pass reruns the review against the findings in `contractaudits2.md` (and cross-referenced with the earlier `contractaudits.md` + `SECURITY_AUDIT_REPORT.md`). The contracts have received substantial hardening since Pass 2: proper payable inbound revenue paths (`receiveBattleCut` / `receiveSponsorshipCut`), non-blocking fee accounting via `pendingFeeWithdrawals` + `claimPendingFees()`, full EIP-712 context in signatures (structurally), removal of most immediate setters, resolution deadline enforcement, refund protection for resolved battles, and distributor timelock + daily caps.

**Overall Status After Pass 3 Review:**  
Much improved. The critical "seasonal fees permanently stuck" path from Pass 2 is now fixed. Most Pass 2 blockers are resolved. However, **one new correctness bug** (EIP-712 signature construction) will cause `resolveWinner` to fail in practice, and SponsorshipPayments still has blocking fee transfers that can prevent legitimate payments. The system is closer to deployable but not yet ready without fixes + professional audit.

---

**Status of Pass 2 Findings**

1. **Battle seasonal fees never transferred / stuck in BattleTreasury** (Critical)  
   **Status: Fixed**  
   `BattleTreasury.claim` (lines 417-424) now calls `seasonalTreasuryReceiver.call{value: ...}(abi.encodeWithSignature("receiveBattleCut(bytes32,bytes32)", ...))`.  
   `MajorLeagueTreasury.receiveBattleCut` (186-197) is payable and correctly credits `prizePools[poolId]` or `unallocatedBalance`.  
   Failures are caught and recorded in `pendingFeeWithdrawals` (non-blocking). Same pattern used for protocol fees.

2. **Failed non-blocking fee transfers create unaccounted stuck balances** (High)  
   **Status: Fixed (Battle + MajorLeague), Partial (Sponsorship)**  
   Both `BattleTreasury` and `MajorLeagueTreasury` now implement `pendingFeeWithdrawals[addr] += amount` on failure + public `claimPendingFees()`.  
   `MajorLeagueTreasury.claimReward` also uses the winner-first + non-blocking fee pattern.  
   **Remaining:** `SponsorshipPayments.payForSponsorship` (157-160) still does `require(lSuccess, "League transfer failed")` (and same for protocol/recipient). A reverting league or protocol receiver will block the entire sponsorship payment.

3. **Sponsorship receiver timelock bypassed by immediate setter** (High)  
   **Status: Fixed**  
   No `setReceivers` exists. Only internal `_setReceivers` (constructor only) + `proposeProtocolFeeReceiver` / `executeProtocolFeeReceiver` (and seasonal equivalent) with 2-day timelock.

4. **Distributor role changes immediately executable** (High)  
   **Status: Fixed + Hardened**  
   Immediate `setDistributor` removed. Only `proposeDistributorChange(address, bool)` + `executeDistributorChange()` using a proper `PendingDistributorChange` struct that binds both the address and the `allowed` flag (addresses Pass 2 finding #9). Additional controls: `maxAllocationPerTx`, per-distributor `distributorDailyLimit`, and daily spent tracking.

5. **Resolved battles refundable after resolutionDeadline** (Medium/High)  
   **Status: Fixed**  
   `refund()` safety hatch (470) explicitly requires `state == Active && pastResolutionDeadline`.  
   Comment and logic: "We deliberately do NOT allow generic refund once Resolved to protect the game outcome." Resolved battles must be claimed by the winner.

6. **Late resolution allowed after resolutionDeadline** (Medium)  
   **Status: Fixed**  
   `resolveWinner` (345): `if (block.timestamp > battle.resolutionDeadline) revert DeadlinePassed();`

7. **EIP-712 struct omitted creator/challenger/seasonalPool** (Medium)  
   **Status: Structurally Fixed (but see new bug below)**  
   `RESOLVE_WINNER_TYPEHASH` and encoding (318-361) now include the full recommended set: battleId, creator, challenger, winner, stakeAmount, depositDeadline, resolutionDeadline, seasonalPoolId. Domain separator includes name, version, chainId, verifyingContract.

8. **Sponsorship pool routing not caller-controlled** (Medium)  
   **Status: Fixed**  
   `payForSponsorship(..., bytes32 poolId)` accepts and forwards the poolId to `receiveSponsorshipCut(sponsorshipId, poolId)`. `receiveSponsorshipCut` (155-166) credits the specific pool when non-zero.

9. **Timelocked distributor proposal did not bind the action** (Low/Medium)  
   **Status: Fixed** (see #4 above — struct now stores `allowed`).

10. **Build compatibility / OpenZeppelin version mismatch** (Informational)  
    **Status: Fixed**  
    Project pins `@openzeppelin/contracts": "^5.0.2"`. All three contracts correctly import from `utils/ReentrancyGuard.sol`, `utils/cryptography/MessageHashUtils.sol`, and use `Ownable(msg.sender)` constructor style.

**Previously Flagged Items Rechecked (Pass 1 + Pass 2)**
- Stake amount enforcement, creator != challenger, battle.settled, direct ETH rejection, league claims while paused: all present and correct.
- Timelocks on critical changes: present (2 days) for fee receivers + resolver in Battle, fee receivers + distributor in MajorLeague. Sponsorship receivers also timelocked.
- Pause does not freeze claims: correct in both Battle (no pause gate on claim/refund) and MajorLeague (claims allowed while paused).

---

**New Findings — Pass 3**

1. **EIP-712 signature digest is incorrectly double-wrapped (resolveWinner will fail for standard signers)**  
   Severity: **High** (Correctness / Funds can be unclaimable)  
   Affected: `BattleTreasury.resolveWinner` (363-368)

   ```solidity
   bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
       keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash))
   );
   if (digest.recover(signature) != resolver) revert InvalidSignature();
   ```

   The inner `keccak256("\x19\x01" || domain || structHash)` is already the complete EIP-712 digest.  
   Wrapping it again with `toEthSignedMessageHash` (which adds "\x19Ethereum Signed Message:\n32" + hash) produces a non-standard hash.

   **Impact:** Any resolver using standard EIP-712 signing (ethers `signTypedData`, web3 `signTypedData_v4`, Ledger Live, etc.) will produce a signature that recovers to the wrong address. `resolveWinner` will always revert with `InvalidSignature()`. Winners cannot claim. Battles become permanently stuck in Resolved state (or force reliance on the post-deadline refund hatch for Active battles only).

   **Evidence:** Lines 363-365 in BattleTreasury.sol.

   **Recommended remediation:**
   Remove the outer `toEthSignedMessageHash`. Use:
   ```solidity
   bytes32 digest = keccak256(
       abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash)
   );
   if (digest.recover(signature) != resolver) revert InvalidSignature();
   ```
   Or inherit OZ `EIP712` and use `_hashTypedDataV4(structHash)` (preferred for future maintainability). Update any off-chain signing code to produce a raw EIP-712 signature (not personal_sign of the struct hash).

2. **SponsorshipPayments still uses blocking transfers for protocol and league cuts**  
   Severity: **Medium** (Availability / Griefing)  
   Affected: `SponsorshipPayments.payForSponsorship` (148-160)

   Recipient is paid first with `require`, then protocol and league also use `require(..., "X transfer failed")`.

   If `protocolFeeReceiver` or `seasonalTreasuryReceiver` (MajorLeagueTreasury) ever reverts (out of gas, contract self-destructed later, receiver implements reverting fallback, or during a temporary MajorLeague pause/upgrade scenario), every sponsorship payment reverts. This is the exact "fee receivers can deny payments" class of issue flagged in earlier passes and deliberately mitigated in the battle claim path.

   **Recommended remediation:** Apply the same non-blocking + `pendingFeeWithdrawals` pattern used in BattleTreasury.claim and MajorLeague.claimReward. Pay recipient first (still require success, as this is the primary purpose of the tx), then attempt protocol/league with failure → credit pending + emit event. This makes sponsorship payments reliable for the sponsor/recipient even if the treasury side is temporarily unhealthy.

3. **No cancellation path for pending timelock changes**  
   Severity: **Low**  
   Affected: All three contracts (propose/execute patterns for receivers, resolver, distributor).

   Once `proposeX` is called, the owner must wait the full TIMELOCK_DELAY even if the proposed value was entered incorrectly. No `cancelPendingX` function exists.

   **Recommended remediation:** Add simple cancel functions callable by owner that delete the pending struct and emit a cancellation event. Low risk but improves operational safety.

4. **Immediate `setAuthorizedCreator` remains a powerful un-timelocked backdoor**  
   Severity: **Low / Medium** (trust assumption)  
   Affected: `BattleTreasury.setAuthorizedCreator`

   Owner can instantly add any address as an authorized creator. A compromised or malicious owner (or during the window after a multisig compromise) can add a colluding creator + resolver can manufacture winning battles and drain user deposits.

   This is documented in TRUST_MODEL.md as an accepted owner power, but it is not rate-limited or timelocked like the other high-impact changes.

   **Recommended remediation:** Either (a) timelock creator additions/removals, or (b) document explicitly that the authorized creator set must be treated as a highly privileged multisig role with strict monitoring, or (c) move creator authorization to a separate minimal factory contract with its own controls.

5. **Whole-project compilation currently fails (unrelated file)**  
   Severity: **Informational / Operational**  
   `LeagueTreasury.sol:21` has a syntax error ("Expected identifier but got 'public'"). This does not affect the three scoped contracts (which use correct OZ v5 patterns and compile in isolation), but blocks `hardhat compile` for the monorepo.

   **Recommended remediation:** Fix or exclude the stale LeagueTreasury.sol (or whatever legacy file is broken) before any deployment pipeline or CI that runs full compilation.

---

**Additional Observations (Positive + Minor)**

Positive:
- Revenue accounting is now sound: inbound cuts credit explicit pools or unallocated; `allocateUnallocatedToPool` and `fundPrizePool` exist to move value.
- Daily distributor limits + max per tx are good blast-radius controls.
- View helpers (`getBattleParticipantInfo`, `getSplit`, `getClaimableAmount`, `getNetClaimableAmount`, etc.) are developer-friendly.
- Direct ETH is rejected in Battle and Sponsorship; credited as unallocated in MajorLeague (with receive()).

Minor / Style:
- `markActive` is still a near-no-op (only reverts if not already Active). Consider removing.
- `receiveBattleCut` emits only the generic `PrizeFunded` (with from = BattleTreasury address). Consider a dedicated `BattleCutReceived(bytes32 battleId, bytes32 poolId, uint256 amount)` event for clearer off-chain indexing.
- State variable declarations for daily limit mappings appear after functions that use them (works in Solidity but hurts readability).
- Sponsorship `totalPaidPerSponsorship` accumulates but never gates or dedupes; multiple payments for the same ID are still possible (low severity, matches original design intent per docs).

---

**Overall Risk Summary — Pass 3**

The contracts are in significantly better shape than after Pass 1 or 2. The critical stuck-funds path is closed, timelocks are real, signature context is complete on paper, and failed-fee accounting exists.

**Blocking issues for any deployment:**
1. Fix the EIP-712 digest construction in `resolveWinner` (High — signatures will not verify).
2. Make SponsorshipPayments fee transfers non-blocking (Medium — otherwise sponsorship revenue can be DoS'd).

After those two fixes, the remaining risks are primarily operational / trust assumptions (resolver key compromise, distributor abuse, owner multisig hygiene) which are documented in TRUST_MODEL.md and mitigated with timelocks + caps + events. Those are acceptable for a controlled launch **only** with:
- Owner and resolver keys on hardware + multisig where possible.
- 24/7 monitoring of all admin and money-moving events.
- Professional third-party audit before mainnet.
- Testnet adversarial testing (especially around signature flows, deadline edge cases, and fee failure paths).

Highest-priority fixes for the next iteration:
1. Correct the digest in resolveWinner (remove outer toEthSignedMessageHash).
2. Apply non-blocking fee pattern to SponsorshipPayments (pay recipient with require, fees with pending accounting).
3. Add cancel functions for pending timelock proposals (optional but recommended).
4. Decide whether `setAuthorizedCreator` should also be timelocked.
5. Clean up the project-wide compile error in the legacy LeagueTreasury file.

This internal Pass 3 review is still not a substitute for a professional audit firm. The financial nature of these contracts (user deposits + prize distribution) warrants external review before any real value is at risk.

**End of Pass 3 Report**  
(Compare with contractaudits2.md and SECURITY_AUDIT_REPORT.md for delta.)