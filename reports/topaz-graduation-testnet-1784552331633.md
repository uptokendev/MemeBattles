# Topaz Graduation Testnet Acceptance

Status: **PASS**

## Run

| Field | Value |
| --- | --- |
| Generated at | `2026-07-20T12:58:50.775Z` |
| Network | `bscTestnet` |
| Chain ID | `97` |
| Evidence required | `false` |
| Acceptance input | `not provided` |
| JSON report | `E:\Network\Zakelijk\MemeWarzone\reports\topaz-graduation-testnet-1784552331633.json` |

## Core Contracts

| Field | Address |
| --- | --- |
| LaunchFactory | `0xa7fFFB7d2575427B143F76A68F41379d8DA168e7` |
| PermanentLpLocker | `0xab6AF3B5eA8Dc4599b75aed39cf6f6eaB118526A` |
| Topaz router | `0xe559d93643631E9E8Cc7d10ADFA581Be4b5399C8` |
| Topaz pool factory | `0xE34346710cca352a3b69A080067d176C8ACA97D9` |
| Topaz WBNB | `0x4E7aF54D355684EF206DAb0b5Dca8695D1e75dA2` |
| Volatile fee bps | `100` |

## Campaign Evidence

| Field | Value |
| --- | --- |
| Campaign | `not provided` |
| Token | `not provided` |
| Creator | `not provided` |
| Graduated pool | `not provided` |
| Graduation tx | `not provided` |
| Buy tx | `not provided` |
| Sell tx | `not provided` |
| Harvest tx | `not provided` |

## Pool Evidence

| Field | Value |
| --- | --- |
| Pool stable | `false` |
| Pool token0 | `not provided` |
| Pool token1 | `not provided` |
| Initial token reserve | `not provided` |
| Initial WBNB reserve | `not provided` |
| Current token reserve | `not provided` |
| Current WBNB reserve | `not provided` |
| Final curve price | `not provided` |
| Initial DEX price | `not provided` |

## Fee And Locker Evidence

| Field | Value |
| --- | --- |
| LP before trades | `not provided` |
| LP after harvest | `not provided` |
| Current locker LP | `not provided` |
| Claimed token | `not provided` |
| Claimed WBNB | `not provided` |
| Creator token received | `not provided` |
| Creator WBNB received | `not provided` |
| Protocol token received | `not provided` |
| Protocol WBNB received | `not provided` |
| Creator share bps | `8000` |
| Protocol share bps | `2000` |

## Checks

Passed checks: 11/11

| Check | Result |
| --- | --- |
| chainId | PASS |
| code.LaunchFactory | PASS |
| code.PermanentLpLocker | PASS |
| code.TopazPoolFactory | PASS |
| code.TopazRouter | PASS |
| code.TopazWBNB | PASS |
| factory.volatileFeeBps | PASS |
| manifest.chainId | PASS |
| manifest.volatileFeeBps | PASS |
| router.defaultFactory | PASS |
| router.weth | PASS |

## Errors

No errors.

## Notes

- Set TOPAZ_ACCEPTANCE_REQUIRE_EVIDENCE=true to fail the report when final campaign, transaction, and harvest evidence is missing.
