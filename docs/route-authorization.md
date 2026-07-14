# Route Authorization Payloads

This protocol uses `signMessage(bytes(digest))` over deterministic ABI-encoded digests. The recovered signer must match `LaunchFactory.routeAuthority()`.

## Create Campaign Route Authorization

Used by `LaunchFactory.createCampaignAuthorized(req, routeAuth)`.

First hash the campaign request:

```ts
const requestHash = keccak256(abi.encode(
  [
    "bytes32", "bytes32", "bytes32", "bytes32", "bytes32", "bytes32",
    "uint256", "uint256", "uint256", "address"
  ],
  [
    keccak256(toUtf8Bytes(req.name)),
    keccak256(toUtf8Bytes(req.symbol)),
    keccak256(toUtf8Bytes(req.logoURI)),
    keccak256(toUtf8Bytes(req.xAccount)),
    keccak256(toUtf8Bytes(req.website)),
    keccak256(toUtf8Bytes(req.extraLink)),
    req.basePrice,
    req.priceSlope,
    req.graduationTarget,
    req.lpReceiver
  ]
));
```

Then sign this digest:

```ts
const digest = keccak256(abi.encode(
  ["string", "uint256", "address", "address", "bytes32", "uint8", "uint8", "uint64"],
  [
    "MWZ_CREATE_ROUTE_AUTH",
    chainId,
    launchFactoryAddress,
    creatorAddress,
    requestHash,
    tradeRouteProfile,
    finalizeRouteProfile,
    deadline
  ]
));
```

Replay protection is on-chain per digest. A signature for one campaign request cannot authorize a different name, symbol, logo, links, curve override, graduation target, or LP receiver.

## Trade Route Authorization

Used by:

- `LaunchCampaign.buyExactTokensAuthorized(amountOut, maxCost, routeProfile, deadline, signature)`
- `LaunchCampaign.buyExactBnbAuthorized(minTokensOut, routeProfile, deadline, signature)`
- `LaunchCampaign.sellExactTokensAuthorized(amountIn, minPayout, routeProfile, deadline, signature)`

Action IDs:

- `0`: `buyExactTokensAuthorized`
- `1`: `buyExactBnbAuthorized`
- `2`: `sellExactTokensAuthorized`

Digest:

```ts
const digest = keccak256(abi.encode(
  ["string", "uint256", "address", "address", "uint8", "uint8", "uint256", "uint256", "uint64"],
  [
    "MWZ_ROUTE_TRADE_AUTH",
    chainId,
    campaignAddress,
    actorAddress,
    routeProfile,
    action,
    amount,
    limit,
    deadline
  ]
));
```

Field meaning by action:

| Action | `amount` | `limit` |
| --- | --- | --- |
| `0` buy exact tokens | `amountOut` | `maxCost` |
| `1` buy exact BNB | `msg.value` | `minTokensOut` |
| `2` sell exact tokens | `amountIn` | `minPayout` |

Replay protection is on-chain per digest. A signature for one operation, actor, route profile, amount, or slippage bound cannot be reused for another trade intent.

## Verification Script

Run the route-authority verifier after deploy:

```bash
LAUNCH_FACTORY_ADDRESS=<factory> ROUTE_AUTHORITY_ADDRESS=<signer> npm run verify:route-authority -- --network <network>
```

For a local signer round-trip check, use `ROUTE_AUTHORITY_PRIVATE_KEY` instead of `ROUTE_AUTHORITY_ADDRESS`. The script prints sample create/trade digests and verifies that the configured private key recovers to the on-chain route authority.
