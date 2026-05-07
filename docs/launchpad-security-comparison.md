# MemeBattles Launchpad — Competitive & Security Comparison

**Date:** 2026-04-22
**Status:** Reference document. Informs pre-mainnet hardening scope.
**Maintainer:** Sven

## TL;DR

MemeBattles sits in a crowded BSC bonding-curve launchpad space alongside **Four.meme**, **Gra.fun**, **Printr** (multi-chain including BSC), and the Solana-native giants **Pump.fun** and **Moonpad**. Our core bonding-curve flow is sound, our LP burn-to-dead is a structurally stronger anti-rug than every competitor, and our upcoming tier-based protection framework positions us above Four.meme and Gra.fun on creator-gating.

The competitive deep review plus the two audits we have in-hand (Salus's Four.meme audit, Ackee's 171-page Printr audit) surface **five concrete pre-mainnet blockers** and **~10 strong follow-ups**. Most blockers are small, surgical fixes; two of them (code-size management, a pair-pre-seeding graduation DoS) are architectural and matter before we ship.

This document consolidates:
- Platform-by-platform comparison
- Security audit lessons
- Assessment of where MemeBattles is ahead
- Prioritized recommendations (blockers → follow-ups → nice-to-haves → deferred)

---

## 1. Platform overview

| Platform | Chain(s) | Bonding curve | Graduation target | LP treatment | Status |
|---|---|---|---|---|---|
| **MemeBattles** (us) | BSC | Linear (`basePrice + slope × x`) | ~50 BNB (configurable) | **Burn to `0x…dEaD`** | Pre-mainnet |
| **Four.meme** | BSC | `x·y=k` with virtual reserves | ~18 BNB | PancakeSwap v2 pair | Live, Salus-audited (2024) |
| **Gra.fun** | BSC, ETH, NEAR, Conflux | `x·y=k` Fair Curve / Classic Curve variants | 30–38.75 BNB | PancakeSwap v3 pair | Live |
| **Printr** | Multi-chain (ETH, BSC, Base, etc.) | `x·y=k` with virtual reserves | Creator-defined | UniV3/Pancake/Algebra NFT + GoPlus locker | Live, Ackee-audited (2025) |
| **Pump.fun** | Solana | `x·y=k` with virtual reserves | SOL equivalent ~$69K MC | Migrate to PumpSwap (own AMM), **LP burned** | Live |
| **Moonpad** | Solana | Undocumented publicly | Undocumented | Undocumented | Live |
| **Four.meme (Tax Token)** | BSC | Same as Four.meme base | Same | Pair + ongoing trade tax | Live |

## 2. Feature & security matrix

Legend: **✅ have it**, **❌ don't have it**, **🟡 partial / WIP**, **—** not applicable.

### 2.1. Core bonding-curve safety

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Pre-graduation transfer lock (user→user blocked) | ✅ contract-owned | ❌ | ❌ | ✅ contract-owned | ✅ `tradingEnabled` flag |
| Block direct LP seeding pre-graduation | ✅ | ❌ | ❌ | ✅ | ✅ |
| LP burn at graduation (no unlock ever) | ✅ | ❌ | ❌ | ❌ (locker) | ✅ |
| LP lock via third-party locker | — | ❌ | ❌ | ✅ (GoPlus) | — (we burn) |
| Slippage protection on buy/sell | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reentrancy guards on all value-transfer paths | ✅ | ✅ | ✅ | ✅ | ✅ |
| Immutable token parameters after creation | ✅ | ✅ (advertised) | ✅ | ✅ | ✅ (via clones) |
| Auto-graduation in completion trade | ✅ | ✅ | ✅ | ✅ | ✅ |
| Fee-on-transfer token defense | ✅ | — | — | — | ✅ |

### 2.2. Anti-bot / anti-snipe

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Dynamic fee by market cap | ✅ | ❌ | ❌ | ❌ | ❌ |
| Declining fee multiplier first N blocks | ❌ | ✅ (opt-in "AntiSniperFeeMode") | ✅ Alpha Launch | ❌ | ❌ (scoped out for v1) |
| 1-buy-per-wallet-per-block first N blocks | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (Premium tier) |
| First-minute wallet cap | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (Premium tier) |
| Sniper-pattern detection (behavioural block) | ❌ | ❌ | ✅ Alpha Launch (next-block ban, 30d auto-unban) | ❌ | ❌ |
| Mandatory creator no-sell window | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (tier-scaled) |

### 2.3. Creator gating

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Permissionless creation | ✅ | ❌ (backend signature required) | ✅ | ✅ | ✅ |
| Creation cooldown per address | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (tier-based) |
| Concurrent-campaign cap per creator | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (tier-based) |
| Tiered creator reputation system | ❌ | ❌ | ❌ | ❌ | 🟡 WIP (Base / Premium / Verified) |
| Anti-vamp (dedupe ticker+logo) | ❌ | ❌ | ❌ | ✅ 48h lockout | ❌ |
| Creation bond (refundable) | ❌ | ❌ | ❌ | ❌ | ❌ (scoped out for v1) |
| Abandon cleanup (free stale slots) | ❌ | ❌ | ❌ | ❌ | 🟡 Planned |

### 2.4. Launch configurability

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Fixed launch profiles (presets) | ✅ 1 profile | ✅ 1 profile | ✅ 2 curves (Fair/Classic) | ✅ 3 profiles + Custom | ❌ Single default + per-campaign overrides |
| Creator-selectable start price | ❌ | ❌ | ❌ | ✅ (Custom) | ✅ |
| Creator-selectable graduation target | ❌ | ❌ | ❌ | ✅ | ✅ |
| Tier-gated advanced parameters | ❌ | ❌ | ❌ | ❌ | Proposed |

### 2.5. Administrative safety & incident response

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Global trading pause (kill switch) | ✅ `disable_flags` bitmask | ✅ `_tradingHalt` | ❓ | ✅ | ❌ |
| Per-token trading pause | ❌ | ✅ `suspendTrading(token, bool)` | ❓ | ❌ | ❌ |
| Role-based access (multiple privileges) | ✅ | ✅ `DEFAULT_ADMIN` / `DEPLOYER` / `OPERATOR` | ❓ | ✅ | ❌ (single Ownable) |
| Upgradeable contracts | ❌ | ✅ UUPS | ❓ | ✅ UUPS | ❌ (immutable — safer) |
| Admin parameter timelocks | ❌ | ❌ | ❓ | ❌ | 🟡 We have on `TreasuryRouter`, not elsewhere |
| Multisig ownership | Recommended | Recommended | ❓ | ✅ | Planned |
| One-way "go-live" latch | ❌ | ❌ | ❓ | ❌ | ✅ `live` |

### 2.6. Fee / revenue model

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Flat trade fee | ✅ 1% protocol | ✅ 0.25% LP fee | 0.5–1% | Configurable | ✅ 2% (incl. 0.75% League) |
| Graduation fee | ❌ | — | 1 BNB | ❌ | ✅ 2% of raise |
| Creator fee vault (pull pattern) | ✅ | ❌ | ❌ | ❌ | 🟡 Partial (escrow for fees only) |
| Trader cashback | ✅ opt-in | ❌ | ❌ | ❌ | ❌ |
| Post-graduation tax tokens | ❌ | ✅ (1/3/5/10% fixed rates) | ❌ | ❌ | ❌ |
| Router-fee injection on sell (third-party UI fee) | ❌ | ✅ up to 5% | ❌ | ❌ | ❌ |
| Cross-campaign community treasury | ❌ | ❌ | ❌ | ❌ | ✅ League (unique to us) |
| Per-campaign upvote fee | ❌ | ❌ | ❌ | ❌ | ✅ UPVoteTreasury (unique to us) |

### 2.7. Observability

| Mechanism | Pump.fun | Four.meme | Gra.fun | Printr | **MemeBattles** |
|---|:---:|:---:|:---:|:---:|:---:|
| Events emit price, volume, fee | ✅ | ✅ | ✅ | ✅ | 🟡 Minimal (amountOut, cost only) |
| On-chain buyer counter | ❌ | ❌ | ❌ | ❌ | ✅ |
| On-chain volume accumulators | ❌ | ❌ | ❌ | ❌ | ✅ `totalBuyVolumeWei` / `totalSellVolumeWei` |
| Helper contract for off-chain pre-calc | ❌ | ✅ `TokenManagerHelper3` | ❌ | ❌ | ❌ (inline on campaign) |

## 3. Architectural comparison

### 3.1. Contract layout

- **MemeBattles**: Factory + EIP-1167 minimal-proxy clones. Each campaign is an isolated clone with its own storage. Token is a fresh `LaunchToken` contract per campaign. **Immutable per campaign.**
- **Four.meme**: Monolithic `TokenManager2` with mapping-based per-token state (`_tokenInfos[address]`). Whole protocol is UUPS-upgradeable. Individual tokens deployed via `_templates[]` registry.
- **Pump.fun**: Solana-native; one program, PDA accounts per mint. Non-upgradeable in the Solana sense but authority can deploy new programs.
- **Printr**: Multi-contract (`PrintrPrinting`, `PrintrTrading`, `PrintrTeleport`, `Treasury`, liquidity modules per DEX). UUPS-upgradeable. Cross-chain via Axelar ITS + LayerZero.
- **Gra.fun**: Not fully documented publicly; appears to be multi-contract with DAO treasury component.

**Assessment.** Our EIP-1167 clones trade some upgrade flexibility for *much* stronger immutability guarantees per-campaign. Printr's Ackee audit found 10 Critical issues across its cross-chain surface — a complexity class we completely avoid. Four.meme's Salus audit flagged their UUPS upgradeability as a centralization risk. **Our architectural choice is conservative in the right way.**

### 3.2. LP handling at graduation

- **MemeBattles**: LP burned to `0x000…dEaD`. Permanent, no counterparty, no unlock.
- **Four.meme**: Standard pair creation. No lock mentioned.
- **Gra.fun**: Alpha Launch uses FlokiFi Locker, variable duration.
- **Printr**: Uniswap v3 NFT position locked via GoPlus; ongoing `collectFees(lockId, ...)` by admin.
- **Pump.fun**: LP burned.

**Assessment.** Printr's model — held NFT + collect fees — gives the protocol ongoing revenue but introduces a counterparty (GoPlus) and a key-compromise risk. Our burn-to-dead is maximally adversary-resistant. **This is a marketing advantage we should lead with.**

### 3.3. Creator fee flow

- **MemeBattles**: Fees distributed in-trade (split protocol / league), creator paid in full at graduation.
- **Pump.fun**: Creator fees accumulate in a PDA vault; creator calls `collectCreatorFee()` (pull pattern).
- **Four.meme**: Tax tokens accumulate dividends in `feePerShare` accumulator; users call `claimFee()` (pull pattern).

**Assessment.** Pull-based patterns are more robust to recipient failure (contract wallets that revert, deployed-to-smart-wallet addresses, etc.). Ackee's Printr audit Finding M1 was specifically about unchecked refund calls; our direct `call{}` to creator at graduation has the same class of failure mode. **Recommendation: escrow the creator graduation payout to a `pendingNative`-style vault, let creator pull.**

---

## 4. Audit findings recap

### 4.1. Salus audit of Four.meme (2024-07-02)

Scope: `TokenManager.sol` and supporting contracts. 0 High, 2 Medium, 5 Low, 1 Info.

| # | Severity | Finding | Applies to us |
|---|---|---|---|
| 1 | Medium | Signature replay during `createToken` (no `chainId`) | No — we don't use off-chain signatures |
| 2 | Medium | `withdrawEth(to, amount)` lets owner drain all ETH | Partially — `feeRecipient` and `setRouter` have similar concerns |
| 3 | Low | Redundant permission wrappers | No — we use OZ `Ownable` cleanly |
| 4 | Low | Implementation contract can be initialized by anyone | No — our `LaunchCampaign` constructor sets `_initialized = true` |
| 5 | Low | No upper bound on `setLaunchFee` | **Yes — applies to our `setTierConfig`** |
| 6 | Low | Different tokens can share same symbol | **Yes — anti-vamp applies to us** |
| 7 | Low | Missing events on critical setters | No — our admin setters emit |
| 8 | Info | `createToken` reverts on extreme ratios | No — `_validateConfig` catches these |

### 4.2. Ackee audit of Printr (2025-11-24, rev 2.2)

Scope: 171 pages covering `PrintrPrinting`, `PrintrTrading`, `PrintrTeleport`, `Treasury`, liquidity modules. **60 total findings: 10 Critical, 4 High, 5 Medium, 10 Low, 15 Warning, 16 Info.**

Most Critical findings were in the cross-chain surface (Axelar ITS, LayerZero) that we do not have. Filtering to architecture we share with Printr:

| # | Severity | Finding | Applies to us |
|---|---|---|---|
| C1 | Critical | Native token not refunded after partial AMM fill | No — we don't trade post-graduation through the contract |
| C8 | Critical | Graduation DoS via `type(uint128).max` liquidity param | No — we use Uniswap v2 `addLiquidityETH`, not v3 positions |
| C10 | Critical | `teleportFrom` missing allowance consumption (approve race) | No — no teleport equivalent |
| H4 | High | Overestimated base token required for ERC20 post-graduation trades | No — we don't route through a DEX |
| M1 | Medium | Unchecked refund calls lose funds | **Yes — creator graduation payout has same pattern** |
| M2 | Medium | `priceLimit` ignored in some branches | Partial — verify `buyExactBnbFor` slippage handling |
| L3 | Low | Hardcoded 3000 gas on ETH transfer | No — we forward full gas |
| L4 | Low | Overflow in `completionPrice` for small base prices | **Yes — unchecked `x*x` in `_area` has same class issue** |
| L9 | Low | Inconsistent refund recipient (msg.sender vs recipient) | **Partial — verify factory-initiated buy refund path** |
| W6 | Warning | `TelecoinFactory` bytecode size exceeded 24KB cap | **Yes — we are at 79% and adding code** |
| W10 | Warning | Value overflow in curve constants for large supply | **Yes — related to L4** |
| W13 | Warning | Tokens with same symbol across chains drain legitimate liquidity | Principle applies: dedupe symbols |
| W15 | Warning | Attacker can front-run pair creation, break graduation swap | **Yes — direct pair pre-seeding attack on us** |
| I12 | Info | Missing events to distinguish behavior | **Yes — our events are thin** |

**Ackee's closing recommendation** after auditing 60 findings across three revisions: *"we recommend considering an additional audit by one more independent team."* Applies to us too — we should plan for ≥1 independent audit before mainnet.

---

## 5. Where MemeBattles is genuinely ahead

These are either unique to us or structurally stronger than every peer:

1. **LP burn to `DEAD`** — beats GoPlus (Printr), FlokiFi (Gra.fun), Pancake pair (Four.meme) on adversary-resistance. No unlock date, no counterparty, no key risk.
2. **Immutable per-campaign clones** — no UUPS upgrade path on a specific campaign means a compromised factory owner cannot retroactively drain or alter an existing campaign. Four.meme's and Printr's UUPS models do not have this property.
3. **League cross-campaign treasury + UPVoteTreasury** — nothing equivalent on any competitor. Structural product moat.
4. **On-chain buyer count + volume accumulators** — no peer emits these directly; third-party launchpads rely on event scraping.
5. **Permissionless with tier gating** — we avoid Four.meme's backend-signature centralization while offering per-tier restrictions competitors don't have.
6. **One-way `live` latch** — simple, auditable gate on whether the protocol can create campaigns at all. Prevents accidental pre-mainnet creation.
7. **Protection framework in progress** — wallet caps, anti-bot, creator no-sell, tiered creator reputation. No live peer has a comparable on-chain creator reputation system.

---

## 6. Pre-mainnet recommendations (prioritized)

### 6.1. Critical — must land before mainnet

Five items. All either have concrete audit evidence (Salus, Ackee) or are structural gaps observed in competitor analysis.

#### C-1. Trading pause flags (per-campaign + global)

**Why.** Four.meme has per-token `suspendTrading(token, bool)` and global `_tradingHalt()`. Pump.fun has `disable_flags` bitmask. Today our only safety lever is "tell users not to trade." If a specific campaign is exploited post-launch we have no way to intervene.

**Sketch.**
- Factory gets `bool public globalPauseBuys`; per-flag bitmask if we want finer granularity later
- `LaunchCampaign` gets `bool public paused`, set only via `setCampaignPaused(address, bool)` on factory (onlyOwner)
- Buy functions check `require(!paused && !factory.globalPauseBuys, ...)`; sell path intentionally left open so holders always have an exit

**Estimated work.** ~30 lines of Solidity, ~4 test cases, 1 event per pause toggle.

#### C-2. Anti-vamp symbol + logo cooldown

**Why.** Validated by three sources: Printr's 48h lockout feature, Salus Four.meme Finding 6 (same-symbol tokens allowed; acknowledged but unfixed), Ackee Printr W13 (cross-chain version of the same issue). Without this, a creator can clone another launch's ticker/logo and hijack attention in the same hour.

**Sketch.**
- `mapping(bytes32 => uint64) public symbolLogoLockedUntil` on factory, key = `keccak256(symbol, keccak256(logoURI))`
- `createCampaign` checks `block.timestamp >= symbolLogoLockedUntil[key]`, sets `symbolLogoLockedUntil[key] = block.timestamp + LOCKOUT`
- `LOCKOUT = 48 hours` constant, owner-tunable via `setAntiVampLockout(uint64)`
- Verified-tier creators exempt (optional — aligns with our existing tier plumbing)

**Estimated work.** ~25 lines, ~5 test cases.

#### C-3. Bounds on `setTierConfig`

**Why.** Salus Finding 5 for Four.meme directly. Our WIP [`LaunchFactory.sol:319-322`](../contracts/LaunchFactory.sol#L319) has no upper bounds on `cooldownSeconds`, `maxLiveCampaigns`, or `creatorNoSellBlocks`. A compromised owner key could set `cooldownSeconds = type(uint256).max` and DoS all creation forever.

**Sketch.**
```solidity
uint256 public constant MAX_COOLDOWN = 7 days;
uint256 public constant MAX_LIVE_CAMPAIGNS = 10;
uint256 public constant MAX_NO_SELL_BLOCKS = 100_000; // ~3.5 days on BSC

function setTierConfig(uint8 tier, TierConfig calldata cfg) external onlyOwner {
    if (cfg.cooldownSeconds > MAX_COOLDOWN) revert InvalidTierConfig();
    if (cfg.maxLiveCampaigns > MAX_LIVE_CAMPAIGNS) revert InvalidTierConfig();
    if (cfg.creatorNoSellBlocks > MAX_NO_SELL_BLOCKS) revert InvalidTierConfig();
    tierConfig[tier] = cfg;
    emit TierConfigUpdated(tier, cfg);
}
```

**Estimated work.** ~8 lines, 3 test cases.

#### C-4. Remove `unchecked` on `_area`'s `x * x` (or cap `totalSupply`)

**Why.** Ackee L4 / W10 for Printr. Our [`LaunchCampaign.sol:646-650`](../contracts/LaunchCampaign.sol#L646) does:

```solidity
unchecked { square = x * x; }
uint256 slopeTerm = Math.mulDiv(priceSlope, square, 2 * WAD * WAD);
```

With default config (`totalSupply = 1e27`), `x*x = 1e54` fits. But `_validateConfig` allows any `totalSupply`; if owner ever sets `totalSupply = 1e40`, `x*x = 1e80` silently wraps around. Silent wraparound in curve math is catastrophic — broken quotes, broken graduation detection, stuck user funds.

**Sketch.** Drop the `unchecked` block; Solidity's built-in overflow check catches it at a cost of a few gas per trade. Alternatively (or additionally) add `uint256 public constant MAX_TOTAL_SUPPLY = 1e30;` and enforce in `_validateConfig`.

**Estimated work.** 1 line change + optional validator bound + 1 test case.

#### C-5. Non-zero `amountTokenMin` / `amountETHMin` in auto-finalize

**Why.** Ackee W15 for Printr: attacker pre-creates the Uniswap pair with one-sided liquidity, forcing graduation to revert or take a severe slippage haircut.

Our comment at [`LaunchCampaign.sol:591-593`](../contracts/LaunchCampaign.sol#L591) assumes pre-seeding is impossible because users can't transfer our token pre-launch. True for our token side — but **the WBNB side is unprotected**. Anyone can send WBNB to the Pancake pair before graduation; our `addLiquidityETH` at [line 596-603](../contracts/LaunchCampaign.sol#L596) passes `minTokens=0, minBnb=0` in the auto-finalize path, so the router will add at whatever ratio the pair demands.

**Verification needed first.** Write a Hardhat test: pre-create pair, send WBNB to it, trigger auto-finalize. Confirm what `addLiquidityETH` actually does. Then decide the fix (pass reasonable mins, or special-case handling of pre-seeded pairs).

**Estimated work.** ~1 day including verification test and fix.

### 6.2. Strong recommendations — do before mainnet if possible

Ten items. All are audit-validated or competitive-gap observations. None are exploitable directly but each closes a class of risk.

| # | Item | Source |
|---|---|---|
| S-1 | Role-based access control replacing single `Ownable` | Four.meme pattern, Salus Finding 2 |
| S-2 | Timelock on `setRouter` (reuse `TreasuryRouter` propose/accept pattern) | Salus Finding 2 generalization |
| S-3 | Creator graduation payout via `pendingNative` escrow | Ackee M1, pump.fun vault pattern |
| S-4 | Detailed trade events (price, sold, balance, fee) | Four.meme, Ackee I12 |
| S-5 | Simplified `abandonCampaign` with campaign-side `abandoned` flag blocking buys | Our earlier design discussion |
| S-6 | Launch profiles (Meme / Growth / Bluechip) + tier-gated Custom | Printr |
| S-7 | Custom errors conversion for `LaunchCampaign` (bytecode savings) | Ackee W6 — prevents hitting 24KB cap |
| S-8 | Merge duplicated buy paths into single `_executeBuy` helper | Ackee W6 |
| S-9 | Drop redundant string storage on campaign (`xAccount` / `website` / `extraLink`) | Deep code review — already in factory |
| S-10 | First-minute wallet cap + anti-bot per-block lock (already WIP, finish it) | Protection framework scope |

**Grouping note.** S-7 through S-9 are the "deep-review cleanup" bundle we previously scoped; they are independent of security but each addresses real bytecode / storage cost. S-7 + S-8 are the only route to long-term headroom under the 24KB contract-size cap.

### 6.3. Nice-to-haves — post-mainnet v1.1+

Not security-critical. Ship v1, ship fast, add these once we see real user behavior.

| # | Item | Source |
|---|---|---|
| N-1 | Anti-bot declining fee multiplier (high fee first few blocks) | Four.meme, Gra.fun — scoped out of protection framework v1 |
| N-2 | Router-fee injection on sell (`feeRate`, `feeRecipient` params) | Four.meme — growth lever for third-party UIs |
| N-3 | Helper contract (`tryBuy` / `trySell` / `getTokenInfo` combined view) | Four.meme — eases SDK integration |
| N-4 | Trader cashback (creator fees partially rebated to swappers) | Pump.fun — interesting primitive |
| N-5 | Dynamic fee tiers by market cap | Pump.fun — creator-friendly fee curve |
| N-6 | Referral reward system | Four.meme — organic growth lever |
| N-7 | AI-agent creator flag (Four.meme's `isAgent` pattern) | Four.meme — narrative/curation |
| N-8 | Post-graduation tax token variant | Four.meme `TaxToken` |

### 6.4. Deferred — tempting but don't build

Things we specifically looked at and rejected for v1.

| # | Item | Reason |
|---|---|---|
| D-1 | UUPS upgradeability | Four.meme Salus Finding 2 + Printr Ackee general trust-model concerns. Our per-campaign immutability is a structural advantage; don't trade it. |
| D-2 | Backend-signed creation | Four.meme-style. Trades permissionlessness for curation; at odds with our positioning. Downtime and compromise risk. |
| D-3 | Cross-chain teleportation | Ackee found 10+ Critical issues across Printr's cross-chain surface alone. Not justified by our roadmap. |
| D-4 | Creation bond (refundable) | Explicitly scoped out by founders. Revisit post-mainnet if spam becomes an issue. |
| D-5 | PoB-style creator-must-stake-to-claim-fees | Printr-specific pattern; large structural change. Our creator-payout-at-graduation model is simpler and user-understood. |
| D-6 | LP lock via third-party (GoPlus / FlokiFi) | Our burn-to-DEAD is strictly stronger. Stay with burn. |
| D-7 | Monolithic token manager with per-token mapping | Four.meme pattern. UUPS and storage-collision risks outweigh the gas savings. Stay with clones. |

---

## 7. Pre-mainnet sign-off checklist

A single-pass list for before we announce mainnet:

- [ ] All Critical items (C-1 through C-5) implemented and tested
- [ ] Decide S-1 through S-10 in / out; implement those in
- [ ] Protection framework Section 1 closed (cooldown, concurrent cap, tier gating, no-sell, first-minute cap, anti-bot per-block, `abandonCampaign`)
- [ ] Frontend ABI regenerated to match contract changes
- [ ] `yarn test` green, 100% pass rate
- [ ] Contract size audit: `LaunchCampaign` < 22KB (2KB buffer below EVM cap)
- [ ] Deploy target BSC testnet; run full end-to-end including graduation
- [ ] Gnosis Safe deployed; factory ownership transferred off EOA
- [ ] `live` latch OFF until post-audit
- [ ] Independent third-party audit (second opinion after this internal analysis)
- [ ] Public bug bounty (Immunefi or similar) announced
- [ ] Upgrade story documented: since contracts are immutable, how do we roll out v1.1? (answer: deploy new factory, let old campaigns run to completion)

---

## 8. Predictions

Calls based on this analysis and my read of the market.

**P-1. Contract-size cap will be the binding constraint.** At 79% of 24KB today, adding anti-vamp + pause flags + role-based ACL + protection framework close-out will push us past it. Custom errors + buy-path merge is not optional. If we don't consolidate, we will hit Ackee's W6 equivalent and be forced to ship a mid-surgery split.

**P-2. Our LP-burn positioning is a market advantage we're underselling.** Every major BSC competitor uses a third-party locker (Four.meme implicitly none; Gra.fun FlokiFi; Printr GoPlus). Our "LP is mathematically unrecoverable" story is strictly stronger and easier to verify. Lead with this in marketing copy. Make the `DEAD` address on every finalized campaign link out to BscScan showing the tokens burnt.

**P-3. The protection framework is a real product moat if shipped well.** None of the five competitors have on-chain creator reputation. If we ship tiered cooldowns + anti-bot for Premium + first-minute caps as advertised, we are the only BSC launchpad offering buyers any structural protection. This is worth prioritizing ahead of nice-to-haves.

**P-4. Four.meme's tax tokens will be copied.** Fixed rates (1/3/5/10%) + locked-at-creation parameters is a cleaner product than most tax-token implementations. If we ever add a tax-token variant, borrow their fixed-rate discipline.

**P-5. The "launch profiles" pattern is converging across platforms.** Printr has 3, Gra.fun has 2, Pump.fun has 1, Four.meme has 1. Our per-campaign full-custom approach is an outlier. Even if we don't ship presets in v1, documenting a recommended preset and UI-defaulting new creators to it gives us the main benefit without contract changes.

**P-6. Centralization risk will be the most-criticized axis by any future auditor.** Every audit we've read (Salus, Ackee) has a Medium/High finding about owner privileges. Shipping pre-mainnet with: (a) multisig owner, (b) role-split access control, (c) timelock on `setRouter`, (d) one-way `live` latch (have), (e) published post-mainnet renounce or delegation plan — addresses this en masse. Don't wait for the audit to tell us; do it proactively.

**P-7. We need at least one independent audit before mainnet.** Ackee's own closing line after their own 60-finding audit of Printr. Even with our narrower scope (single-chain, single DEX, no teleportation), the curve math and graduation logic warrant a second set of eyes. Budget accordingly.

---

## 9. References

- [Ackee Printr Protocol Audit, rev 2.2](../ackee-blockchain-printr-protocol-report-rev.2.2.pdf) (2025-11-24)
- [Salus Four.meme Audit](../Meme_audit_report_2024-07-02.pdf) (2024-07-02)
- [Pump.fun public docs](https://github.com/pump-fun/pump-public-docs)
- [Printr docs](https://printr.gitbook.io/printr-docs)
- [Four.meme docs](https://four-meme.gitbook.io/four.meme)
- [Four.meme contract ABIs and API docs](../fourmemeFiles/)
- [Gra.fun docs](https://docs.gra.fun/)
- [Protection Framework Plan](superpowers/plans/2026-04-08-platform-protection-framework.md)
- [Protection Framework Spec](superpowers/specs/2026-04-08-platform-protection-framework-design.md)
- [Protection Framework Summary](protection-framework-summary.md)

---

*Document status: Reference. Not a plan or spec. Informs scope decisions for pre-mainnet hardening work.*
