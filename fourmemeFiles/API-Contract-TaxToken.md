# Tax Token Contract API Documentation

## Overview

Tax Token is an advanced ERC20 token contract supporting transaction fees, reward distribution, and multiple allocation modes.

**Key Features:**
- Transaction fee mechanism: Charges a certain percentage of fees on buy/sell transactions
- Reward distribution mechanism: Token holders receive reward distributions based on their holdings
- Multiple allocation modes: Fees can be allocated to founder, holders, burn, and liquidity
- Anti-sniper protection: Prevents malicious addresses from participating in rewards through blacklist mechanism

---

## Constants

### Transfer Modes

| Name | Type | Value | Description |
|------|------|-------|-------------|
| `MODE_NORMAL` | `uint` | 0 | Normal transfer mode - allows all transfers |
| `MODE_TRANSFER_RESTRICTED` | `uint` | 1 | Restricted transfer mode - prohibits all transfers |
| `MODE_TRANSFER_CONTROLLED` | `uint` | 2 | Controlled transfer mode - only allows transfers related to owner |

---

## State Variables

### Configuration Variables

| Name | Type | Visibility | Description |
|------|------|------------|-------------|
| `_mode` | `uint` | public | Current transfer mode |
| `quote` | `address` | public | Quote token address (e.g., USDT, BUSD, etc.) |
| `pair` | `address` | public | PancakeSwap pair address (lazily initialized when mode is NORMAL) |
| `founder` | `address` | public | Founder address, receives founder rewards |
| `feeRate` | `uint256` | public | Transaction fee rate (basis points, 10000 = 100%) |
| `rateFounder` | `uint256` | public | Founder allocation rate (percentage, 100 = 100%) |
| `rateHolder` | `uint256` | public | Holder allocation rate (percentage, 100 = 100%) |
| `rateBurn` | `uint256` | public | Burn allocation rate (percentage, 100 = 100%) |
| `rateLiquidity` | `uint256` | public | Liquidity allocation rate (percentage, 100 = 100%) |
| `minDispatch` | `uint256` | public | Minimum dispatch threshold, fees are only dispatched when accumulated fees reach this value |
| `minShare` | `uint256` | public | Minimum holding amount, addresses below this value do not participate in rewards |

### Reward System Variables

| Name | Type | Visibility | Description |
|------|------|------------|-------------|
| `userInfo` | `mapping(address => UserInfo)` | public | User reward information mapping |
| `totalShares` | `uint256` | public | Total token holding shares (sum of all user shares, excluding addresses below minShare) |
| `feePerShare` | `uint256` | public | Cumulative reward amount per share (using MAGNITUDE precision, accumulates with each dispatch) |
| `feeAccumulated` | `uint256` | public | Total accumulated fees (not yet dispatched). May contain remainder due to rounding errors after dispatch |
| `feeDispatched` | `uint256` | public | Total dispatched fees |
| `feeFounder` | `uint256` | public | Total fees allocated to founder |
| `feeHolder` | `uint256` | public | Total fees allocated to holders |
| `feeBurn` | `uint256` | public | Total fees burned |
| `feeLiquidity` | `uint256` | public | Total fees added to liquidity |
| `quoteFounder` | `uint256` | public | Total quote tokens allocated to founder |
| `quoteHolder` | `uint256` | public | Total quote tokens allocated to holders |
| `quoteClaimed` | `uint256` | public | Total quote tokens claimed |

---

## Structs

### UserInfo

User reward information structure.

| Field | Type | Description |
|-------|------|-------------|
| `share` | `uint256` | User token holding share (0 if balance is below minShare) |
| `rewardDebt` | `uint256` | Calculated reward debt, used to track already accounted rewards |
| `claimable` | `uint256` | Claimable reward amount (in quote tokens) |
| `claimed` | `uint256` | Claimed reward amount (in quote tokens) |

---

## Events

### FeeDispatched

Emitted when fees are dispatched and allocated.

```solidity
event FeeDispatched(
    uint256 amountFounder,
    uint256 amountHolder,
    uint256 amountBurn,
    uint256 amountLiquidity,
    uint256 quoteFounder,
    uint256 quoteHolder
);
```

**Parameters:**
- `amountFounder`: Token amount allocated to founder (in token units)
- `amountHolder`: Token amount allocated to holders (in token units)
- `amountBurn`: Token amount burned (in token units)
- `amountLiquidity`: Token amount added to liquidity (in token units)
- `quoteFounder`: Quote token amount allocated to founder in this dispatch (0 if rateFounder is 0)
- `quoteHolder`: Quote token amount allocated to holders in this dispatch (0 if rateHolder is 0 or totalShares is 0)

### FeeClaimed

Emitted when rewards are claimed by a user.

```solidity
event FeeClaimed(
    address account,
    uint256 amount
);
```

**Parameters:**
- `account`: Address claiming rewards
- `amount`: Amount of quote tokens claimed

---

## Public Functions

### setMode

Set transfer mode. 

```solidity
function setMode(uint256 v) public onlyOwner
```

**Parameters:**
- `v`: Target mode:
  - `0`: MODE_NORMAL (normal mode)
  - `1`: MODE_TRANSFER_RESTRICTED (restricted mode)
  - `2`: MODE_TRANSFER_CONTROLLED (controlled mode)

**Note:** Once mode is set to `MODE_NORMAL` when migrated to DEX, it cannot be changed.

### claimableFee

Query the claimable reward amount for an account.

```solidity
function claimableFee(address account) view public returns (uint256)
```

**Parameters:**
- `account`: Account address

**Returns:**
- `uint256`: Claimable quote token amount

**Description:**
Calculates the total claimable rewards for an account, including:
- Previously accumulated claimable rewards (`info.claimable`)
- New rewards calculated from current share and feePerShare

### claimedFee

Query the claimed reward amount for an account.

```solidity
function claimedFee(address account) view public returns (uint256)
```

**Parameters:**
- `account`: Account address

**Returns:**
- `uint256`: Claimed quote token amount

### claimFee

Claim rewards for the caller.

```solidity
function claimFee() external
```

**Effects:**
- Updates caller's share
- Transfers claimable quote tokens to caller
- Updates `claimed` and `quoteClaimed` counters
- Emits `FeeClaimed` event

**Requirements:**
- Caller must not be blacklisted
- Caller must have claimable rewards > 0

---

## View Functions

### userInfo

Get user reward information.

```solidity
function userInfo(address) view public returns (
    uint256 share,
    uint256 rewardDebt,
    uint256 claimable,
    uint256 claimed
)
```

**Parameters:**
- User address

**Returns:**
- `share`: User token holding share
- `rewardDebt`: Calculated reward debt
- `claimable`: Claimable reward amount
- `claimed`: Claimed reward amount

---

### Reward Claiming

Users can claim their accumulated rewards by calling `claimFee()`:

1. Updates user's share (if changed)
2. Calculates claimable amount using `claimableFee()`
3. Checks if user is blacklisted (if yes, returns early)
4. Transfers quote tokens to user
5. Updates `claimed` counters
6. Emits `FeeClaimed` event

---


## Important Notes

1. **Rate Sum**: The sum of `rateFounder`, `rateHolder`, `rateBurn`, and `rateLiquidity` must equal 100.

2. **Minimum Share**: Addresses with token balance below `minShare` do not participate in rewards (their `share` is set to 0).

3. **Blacklist**: Blacklisted addresses cannot claim rewards, even if they have claimable amounts.

4. **Fee Accumulation**: Due to rounding errors, `feeAccumulated` may contain a small remainder after dispatch.

---

## Example Usage

### Query User Rewards

```solidity
// Get claimable rewards
uint256 claimable = token.claimableFee(userAddress);

// Get claimed rewards
uint256 claimed = token.claimedFee(userAddress);

// Get user info
(uint256 share, uint256 rewardDebt, uint256 claimable, uint256 claimed) = token.userInfo(userAddress);
```

### Claim Rewards

```solidity
// User calls claimFee() to claim their rewards
token.claimFee();
```

### Monitor Fee Distribution

```solidity
// Listen for FeeDispatched events
token.FeeDispatched().watch((event) => {
    console.log("Founder allocated:", event.returnValues.amountFounder);
    console.log("Holder allocated:", event.returnValues.amountHolder);
    console.log("Quote tokens for founder:", event.returnValues.quoteFounder);
    console.log("Quote tokens for holders:", event.returnValues.quoteHolder);
});
```

