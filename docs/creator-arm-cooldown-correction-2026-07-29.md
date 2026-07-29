# MemeWarzone creator arm cooldown correction

Date: 29 July 2026
Repository: `uptokendev/MemeBattles`
Branch: `devpostgrad`

## Locked rule

`launchAt` is the immutable timestamp at which campaign trading opens. It is not a launch slot, reservation, queue position, or per-wallet allocation.

- Any number of campaigns may share the same `launchAt`.
- Different creators may arm campaigns for the same second.
- The same creator may arm multiple campaigns for the same sufficiently distant future timestamp, provided each irreversible arming transaction occurs after the creator cooldown and the creator remains below the on-chain live-campaign limit.
- A previously armed campaign must never move another campaign's `launchAt`.
- `scheduled_launch_at` remains a normal non-unique timestamp.

## Creator cooldown

The 24-hour creator cooldown separates irreversible on-chain creation actions:

- Direct Create: checked when the creator deploys.
- Draft Deploy Now: checked when the creator deploys.
- Draft Deploy with Countdown: checked when the creator arms/deploys and pays gas.

The check uses the current block timestamp. A future trading-open time cannot bypass a cooldown that is active now.

Both immediate and scheduled deployment call `CreatorRegistry.recordLaunch(creator)`. Both therefore increment the same `liveBondingCount` and set `lastLaunchTimestamp` to the deployment block timestamp.

Both immediate and scheduled graduation call `CreatorRegistry.recordGraduation(creator)` exactly once.

## Capacity separation

The on-chain `maxLiveBonding` tier limit counts deployed, non-graduated campaigns, including scheduled campaigns whose public trading has not opened yet.

Drafts and ticker reservations do not increment the on-chain count. Off-chain reservation abuse is controlled separately by Railway through authenticated sessions, reservation expiry, extension limits, rate limits, risk signals, and configurable reservation quotas.

Backend responses must keep these concepts distinct:

- `onChainLiveCampaignCount`
- `onChainLiveCampaignLimit`
- `offChainReservationCount`
- `offChainReservationLimit`
- `cooldownEndsAt`
- `canArmNow`

## Generation model

The existing accepted `LaunchCampaign` implementation is reused.

- Corrected factory generation: 3
- Campaign generation: 2

A new factory-owned `PermanentLpLocker` is unavoidable because every factory owns an immutable locker.

## Existing deployed generations

The factory at `0xe0FbBa4533513110Cec7e78aa3e48EC45301B5E6` contains the obsolete scheduled-slot model. It remains support-enabled but must be creation-disabled.

Its locker `0x3Fd82ACA84E43CEDEb6B8b577fd15A1Ce9eC4161` remains authorized in `TreasuryRouterV2`.

The earlier factory `0xF7872169265eCE4E4C93ef894F1635E84DC6F681` also remains support-enabled with its own locker and indexer checkpoint.

Existing campaigns, including TSM and ATS, remain linked to their original factory, campaign implementation, locker, launch timestamp, threshold, and transaction evidence. They are not redeployed or migrated.

## Deployment and activation sequence

1. Compile, test, and run contract-size checks.
2. Deploy the corrected factory while reusing the accepted campaign implementation and other protocol dependencies.
3. Leave the replacement factory disabled.
4. Authorize the replacement factory as a CreatorRegistry launch recorder.
5. Authorize the new locker in TreasuryRouterV2 without deauthorizing any old locker.
6. Run the activation verifier.
7. Enable the corrected factory.
8. Pause creation only on the obsolete factory.
9. Keep existing campaign trading and graduation operational.
10. Update frontend, Railway, database generation records, and multi-factory indexer manifests.

## Acceptance gate

The correction is accepted only after proving:

- current-time cooldown enforcement for immediate and scheduled creation;
- no `launchAt` uniqueness or slot state;
- several creators sharing one `launchAt`;
- one creator sharing one future `launchAt` across separate eligible arming days;
- immediate and scheduled live-count accounting;
- pre-launch trading reverts and first-valid-block trading succeeds;
- creator buy lock remains anchored to `launchAt`;
- the full $6 BSC Testnet bonding, graduation, Topaz trading, LP locking, fee accrual, fee harvest, creator 80%, protocol 20%, indexer, database, frontend, and admin reconciliation flow;
- all old factories and lockers remain supported.

Mainnet readiness and continuous bonding-to-Topaz closeout remain blocked until this acceptance passes.
