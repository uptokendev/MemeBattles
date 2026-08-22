# BNB mainnet factory + locker replacement (prepare only)

Do not execute until the fork evidence below is reviewed.

Fork certification (`ec5262c0` + harness follow-up): **PASS** on Anvil fork of chain 56 against real Topaz.

This is **integration** evidence for graduation/harvest, not production CREATE/security evidence. Route authorization was disabled **in the fork harness only**. The factory we deploy must keep production security.

## Reuse unchanged

| Piece | Address |
|---|---|
| LaunchCampaign implementation | `0xbe3caF640F77e8436BCAF89730251A00fB01608f` |
| TopazRouterAdapter | `0x5c3135Dfaad519A9114DEa2E546f0Cd051d0D35a` |
| Topaz router | `0x1E98c8226e7d452e1888e3d3d2F929346321c6c3` |
| Topaz factory | `0x65E6cD0eF5D3467030103cf3d433034E570b5784` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| GraduationOracle | `0x9D204406d5ECA0f18e48427fDD983A32FdF57C9B` |
| TreasuryRouterV2 | `0xe157a6FDf19CAB61f2ECa048966f137A3240a921` |
| CreatorRegistry | `0x8194FB3745d027102ce7Da562c7045f28B2f42fD` |
| RiskRegistry | `0x92b1494CF7b80dA379EB96F59EeE4Ae7F8970597` |
| Route authority | `0xb989A99823eA96552c3E3198A40CdBF682EDf1aA` |
| ProtocolRevenueVault | `0xc2d4E6f846446f3921a34A34e007295dbc19Bc4c` |
| Treasury / registry Safe | `0x1edcEdf5E5D9C2FAd5F9F6B964077dD74020A7A7` |

## Deploy new

```text
LaunchFactory(
  0x5c3135Dfaad519A9114DEa2E546f0Cd051d0D35a,  // adapter
  0xe157a6FDf19CAB61f2ECa048966f137A3240a921,  // TreasuryRouterV2
  0xbe3caF640F77e8436BCAF89730251A00fB01608f,  // campaign impl
  0x9D204406d5ECA0f18e48427fDD983A32FdF57C9B   // oracle
)
```

Constructor deploys `PermanentLpLocker(newFactory)` automatically.

Source must be the corrected locker:

- `REQUIRED_POOL_FEE_BPS = 30`
- `CREATOR_FEE_BPS = 8000`
- `PROTOCOL_FEE_BPS = 2000`

Do not add `$6` on chain 56.

## Mirror production factory security

After deploy, owner (then Safe) must set:

1. `setRegistries(0x8194…, 0x92b1…)`
2. `setRouteAuthority(0xb989…)`
3. `setConfig` matching current production: supply 1e9, curve 8400, LP tokens 1400, basePrice 1e9, slope 850, **graduationTarget 30000e18**, liquidityBps 3300
4. `requireRouteAuthorization = true`
5. `requireAuthorizedTrading = true`
6. `enableLive()`
7. `lockSecurityDefaults()`
8. `protocolFeeBps = 200`, trade/finalize profiles = 1

Do **not** ship `setRequireRouteAuthorization(false)` or `setRequireAuthorizedTrading(false)`. Those are fork-harness only.

## TreasuryRouterV2 (Safe admin `0x1edc…`)

Old locker `0x64710A4f87aBa3b5ED5B8B25e8ebA4DaC339C998` stays authorized.

```text
setAuthorizedLpLocker(newLocker, true)
setPrimaryLpLocker(newLocker)
```

Required end state:

```text
authorizedLpLocker[0x6471…] = true
authorizedLpLocker[newLocker] = true
permanentLpLocker = newLocker
```

`setPrimaryLpLocker` reverts unless the new locker is already authorized.

## CreatorRegistry

Safe: `setLaunchRecorder(newFactory, true)` so CREATE can `recordLaunch`.

## Inventory / hide nothing after this is the production path

- `VITE_FACTORY_ADDRESS_56 = newFactory`
- `VITE_SUPPORTED_FACTORY_ADDRESSES_56 = newFactory,0x3068eAE6…` (keep old factory for StandbyFolks)
- Indexer `FACTORY_ADDRESS_56` / supported list same pattern
- Do not rewrite `deployments/bscMainnet.factory-only.json` until the new addresses are live; add a new `bscMainnet.factory-30bps-80-20.json`

## Leave in place

Current factory `0x3068eAE6F8431bFc3c5Faae9c3bBB95F007be59a` and locker `0x6471…` remain on-chain for the existing campaign. Creation moves to the new factory.

## Post-deploy read-only checks (before opening CREATE)

- new locker `REQUIRED_POOL_FEE_BPS==30`, `CREATOR_FEE_BPS==8000`, `PROTOCOL_FEE_BPS==2000`
- new factory `campaignImplementation==0xbe3c…`, `router==0x5c31…`
- adapter still unwraps to Topaz `0x1E98…` / `0x65E6…` / WBNB `0xbb4C…`
- Topaz `getFee(0,false)==30`
- `requireRouteAuthorization && requireAuthorizedTrading && securityDefaultsLocked && live`
- treasury primary locker is the new locker; old locker still authorized
- production factory `0x3068…` code unchanged
- `isGraduationTargetAllowedForChain(56, 6e18)==false` on the new factory
