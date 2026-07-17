# MemeWarzone Security Access Matrix

Generated: 2026-07-17T12:09:30.416Z

## Access Matrix

| Contract | Actor | Permission | Guardrail |
| --- | --- | --- | --- |
| LaunchFactory | owner | configuration before first campaign, live mode, pauses, route authority, registries | factory locks mutable economics once campaigns exist |
| LaunchFactory | official campaigns | notify graduation | campaign address must be known by factory |
| LaunchCampaign | factory | pause toggles and authorized-trading toggle | campaign creator cannot bypass factory controls |
| LaunchCampaign | anyone | graduateIfEligible when oracle USD threshold is met | threshold, pause, oracle freshness, Topaz add-liquidity, and locker registration gate execution |
| LaunchCampaign | traders | bonding buys/sells | risk registry, route authorization, launch protection, slippage, solvency |
| GraduationOracle | none | read-only price conversion | immutable feed and max age; no manual price setter |
| PermanentLpLocker | factory/admin | register official graduated pools | Topaz factory, volatile flag, token pair, LP balance, single registration |
| PermanentLpLocker | anyone | harvest registered pool fees | balance-delta accounting, nonReentrant, no LP principal decrease |
| PermanentLpLocker | creator | update own payout recipient | creator identity is snapshotted; admin cannot redirect creator share |
| PermanentLpLocker | admin | recover unrelated accidental assets | registered LP and active fee assets are blocked |
| TreasuryRouter | admin | set route vaults and LP locker | admin should be production multisig |
| TreasuryRouter | PermanentLpLocker | route LP native/ERC20 protocol share | 100% to ProtocolRevenueVault, no campaign/recruiter/airdrop split |
| CreatorRegistry | owner | creator tier/restriction/rules | owner should be production multisig |
| CreatorRegistry | launch recorder | record launch/graduation counts | LaunchFactory recorder only |
| RiskRegistry | owner | wallet and cluster risk state | owner should be production multisig |
| TreasuryVaultV2 | multisig | withdrawals and operator/root poster controls | caps and pauses protect payout lanes |
| CommunityRewardsVault | TreasuryRouter | airdrop/squad deposits | router-only funding lanes |
| RecruiterRewardsVault | operator | recruiter payouts | caps and pause controls |

## Phase 15 Required Checks

- [ ] npm run compile
- [ ] npm test
- [ ] npm run size
- [ ] npm run gas
- [ ] npm run coverage
- [ ] npm run security:matrix
- [ ] slither . --filter-paths node_modules,artifacts,cache
- [ ] manual audit: no registered LP withdrawal/approval/rescue path
- [ ] manual audit: creator + protocol payouts equal collected fees plus pending amounts
- [ ] manual audit: Topaz official interfaces/addresses confirmed before production

## Production Blockers To Close

- [ ] Full Hardhat suite green on latest devpostgrad head.
- [ ] Contract size gate green after locker/indexer/keeper additions.
- [ ] Static review/Slither completed with no critical or high findings.
- [ ] External audit completed and remediations merged.
- [ ] Official Topaz router/factory/WBNB/pool behavior confirmed on BSC testnet.
- [ ] Testnet soak covers graduation, post-grad swaps, claimable fees, harvest, and fallback payments.
