# Solana Graduation Lock — Same-Day A+B Plan

Status: implemented in tree — deploy program + Railway trade-auth + frontend together, then a new campaign  
Scope: Solana only. No BNB. No LP fee work. No old-campaign realloc.  
Date: 2026-08-14

## Final verdict

ChatGPT’s independent write-up matches the on-chain investigation. The cause is locked.

The token is not graduating and then ungraduating. It becomes **eligible**, the UI treats that as **graduated**, and the campaign stays a live bonding campaign. The next sell is a legal `sell_tokens`. That subtracts `sold_tokens` and `net_raised_lamports`, so the bar drops.

Proof that does not depend on the frontend:

- `authorized_trade.rs` requires `!campaign.graduated` before a bonding sell.
- Only `confirm_graduation` writes `campaign.graduated = true`.
- A successful bonding sell therefore means `graduated == false`. Period.

Three bugs, not twenty:

1. Threshold crossing is not sticky on Solana. A sell can undo eligibility.
2. Nothing automatically submits the atomic Meteora graduation TX. `graduate.mjs` is an operator tool and only sends when `SOLANA_GRADUATION_SEND=true`.
3. The UI (and the previous GPT latches) conflate eligible with graduated.

ChatGPT is also right that begin+Meteora+confirm is already one atomic transaction. There is no durable begin-without-confirm state to recover.

Where ChatGPT and the earlier plan agree, we keep it. Naming of the sticky bit does not matter; we use `curve_closed` because it is not `graduated`.

**Do not create another token on the current lifecycle. Do not start LP fee collection until `CampaignGraduated` + a real Meteora pool + a real Meteora swap exist.**

---

## Target state machine

1. **Bonding · Solana** — `!curve_closed && !graduated`. Curve trades open.
2. **Graduating · Solana** — `curve_closed && !graduated`. Bonding buy/sell illegal. Copy: “Threshold reached · awaiting Meteora.” Bar may be 100%. Never say Graduated or Matured.
3. **Graduated · Meteora** — `campaign.graduated == true` on-chain. Bonding dead. Meteora only.

The crossing buy is allowed and may overshoot (0.06 SOL into a 0.0059 SOL remainder). After that fill, the curve freezes. Graduation is a later atomic operator TX, same as `graduate.mjs` already builds.

---

## What we will not do

- Another frontend/indexer graduation latch.
- Set `graduated = true` at eligibility.
- Graduate inside the trader’s buy (Meteora is too heavy).
- Recompute eligibility from a live oracle on every sell (SOL dump would reopen the curve).
- Realloc or keep old Campaign accounts after the program upgrade.
- Touch BNB, LP harvest, or dashboard fee collection in this slice.
- Put the keeper inside the realtime-indexer hot path.

---

## Layout decision

Add `curve_closed: bool` on `Campaign` **immediately after** `graduated`.

Current offsets (including 8-byte discriminator):

| Field | Offset |
|---|---|
| `sold_tokens` | 662 |
| `net_raised_lamports` | 670 |
| `graduated` | 713 |
| `bump` | 714 |

After the change, `graduated` stays at 713. `curve_closed` is 714. Bumps shift +1. Account size +1.

Readers that only need `graduated` at 713 keep working on **new** accounts. The new program cannot deserialize **old** Campaign accounts. That is accepted: this upgrade retires current bonding test tokens. Next rehearsal is a new campaign on the new binary.

Rejected alternative: a separate `curve-close` PDA. Safer for in-place trading of old accounts, slower today (extra account on every buy/sell). We do not need old test tokens.

---

## Raise-target close needs a signed native target

`$6` test campaigns will not sell out the curve. The program has no CoinGecko. So the crossing buy must carry a route-signed `native_target_lamports`, same oracle math `solana-graduation-authorization-v1.js` already uses:

```
native_target = ceil(graduation_target_usd_micros * 1e9 / sol_usd_micros)
```

Bump trade auth to schema v2. Sells send `native_target_lamports = 0`.

Sold-out still closes with no oracle: `sold >= curve_token_supply`.

---

## Implementation slices (do in this order)

### 1. Program — sticky close

Files:

- `programs/memewarzone_solana/src/authorized_create.rs`
- `programs/memewarzone_solana/src/authorized_trade.rs`
- `programs/memewarzone_solana/src/lib.rs` (error)
- `programs/memewarzone_solana/src/graduation.rs` (Campaign literal in tests)
- Any other `Campaign { ... }` literals

Changes:

- Add `pub curve_closed: bool` after `graduated`.
- Init it `false` in `authorized_create`.
- New error `CurveClosed` ≠ `AlreadyGraduated`.
- `BuyTokensArgs` gains `native_target_lamports: u64`.
- `TRADE_AUTH_SCHEMA_VERSION = 2`. Digest appends `native_target_lamports` after nonce.
- `buy_tokens_handler`:
  - Revert `CurveClosed` if `curve_closed || graduated` **before** the fill.
  - After the fill updates `sold_tokens` / `net_raised_lamports`, if `sold >= curve_token_supply` **or** (`native_target_lamports > 0` && `net_raised >= native_target_lamports`), set `curve_closed = true`.
- `sell_tokens_handler`: revert `CurveClosed` if `curve_closed || graduated`.
- When `authorized_trading_required`, buy digest must include the same `args.native_target_lamports` the backend signed.

Do not change `confirm_graduation`. It still owns `graduated = true`.

### 2. Trade auth — schema v2 + refuse closed curve

File: `frontend/api/dev-fix/solana-trade-authorization-v1.js`

- Schema v2 digest matches the program.
- On every **buy**, compute `nativeTargetLamports` with the same CoinGecko / `SOLANA_GRADUATION_SOL_USD_MICROS` helper as graduation-authorize. Put it in the digest and `createArgs`.
- On **sell**, sign `0`.
- Decode campaign `soldTokens`, `curveTokenSupply`, `netRaisedLamports`, `graduated`, and `curve_closed` if `data.length >= 715`.
- Refuse buy and sell with `SOLANA_CURVE_CLOSED` when:
  - `graduated`, or
  - `curve_closed`, or
  - `sold >= curveSupply`, or
  - `netRaised >= computed native target` (oracle available).
- If the oracle is down, still refuse when sold-out / `curve_closed` / `graduated`. Do not refuse raise-target-only on oracle failure; the program will still close on the next successful buy that carries a signed target.

This rail also covers the minutes between crossing buy and keeper.

### 3. Frontend trade client

Files:

- `frontend/src/lib/solanaTradeV1.ts`
- `frontend/src/pages/TokenDetails.tsx`
- `frontend/src/pages/TokenDetailsEntry.tsx`
- `frontend/src/lib/solanaCampaignRead.ts`
- `frontend/src/hooks/useTokenStatsRealtime.ts` only if it still overwrites `graduated: false` from a non-event payload in a way that remounts the bonding page. Keep one-way `true` from `CampaignGraduated`. Stop treating summary `graduated: false` as a reason to leave a Meteora page — the page must not have been mounted unless on-chain `graduated` was true.

Behavior:

- Pass schema v2 + `nativeTargetLamports` through from the authorize response into `buy_tokens`.
- `TokenDetailsEntry`: mount `SolanaGraduatedTokenDetails` **only** when `fetchSolanaCampaignCurveState(...).graduated === true`. Delete `stickyGraduated`. Stop writing `graduated` into `mwz:solana-token-route:v1:`. Keep caching `campaignAddress` only.
- Stage pill:
  - `curve.graduated` → `Graduated · Meteora`
  - `curve.curveClosed && !curve.graduated` → `Graduating · Solana`
  - else → `Bonding · Solana`
- Progress label: replace `Matured` with `Eligible` (or omit). Never `Graduated`.
- If `curveClosed && !graduated`, disable bonding buy/sell and show “Threshold reached · awaiting Meteora.”
- Decode `curveClosed` only when account length is long enough. Do not invent it from progress %.

### 4. Operator + keeper

Files:

- `tools/solana-meteora-graduation/graduate.mjs` — read `curve_closed` at 714 if `buf.length >= 715`. Keep `graduated` at 713. Do not redesign the atomic TX.
- New `tools/solana-meteora-graduation/keeper.mjs` — thin loop:
  1. Load campaign addresses (CLI args and/or `getProgramAccounts` for this program).
  2. Skip if `graduated`.
  3. Include if `curve_closed` **or** (oracle up && sold-out/raise-target met).
  4. Call the same send path as `graduate.mjs` when `SOLANA_GRADUATION_SEND=true`.
  5. Log simulate/send failures. Do not retry-storm; backoff.
- Enable `SOLANA_GRADUATION_AUTH_ENABLED=true` on Railway for the keeper’s authorize call.
- Run the keeper as a one-shot in this rehearsal (`node keeper.mjs --once`) after the crossing buy. Leave a `--watch` mode for later.

### 5. Indexer / summary honesty

Files:

- `realtime-indexer/src/tokenSidePreload.ts`
- `realtime-indexer/src/solanaIndexer.ts` only if a decoder is added

- `graduated` remains `CampaignGraduated` / `graduated_at_chain` only.
- Stop inferring `graduated` from `market_stage`, sticky metadata, or “dex-like.”
- Optional: persist `curve_closed` later. Not required for today’s rehearsal if the UI reads the campaign account.

### 6. Tests

- Program unit: crossing buy with signed target sets `curve_closed`, does not set `graduated`.
- Program unit: sell after close reverts `CurveClosed`.
- Program unit: sold-out close with `native_target = 0`.
- Program unit: overshoot buy still fills, then closes.
- Confirm still sets `graduated` and later sell reverts `AlreadyGraduated`.
- Trade-auth: sell after threshold returns `SOLANA_CURVE_CLOSED`.
- Frontend decode: `graduated` at 713, `curveClosed` at 714 on new accounts.

---

## Deploy order (same day)

1. Land program + IDL. Do not upgrade until the next token is ready to be the only live test campaign.
2. Upgrade / deploy the program. Old Campaign PDAs on this program ID will stop deserializing. That is intended.
3. Deploy Railway trade-auth + graduation-auth (`SOLANA_TRADE_AUTH_ENABLED`, `SOLANA_GRADUATION_AUTH_ENABLED`, `SOLANA_GRADUATION_SEND` only on the keeper host).
4. Ship frontend.
5. Create a **new** Solana campaign. Do not reuse the token that already bounced.
6. Buy until the bar hits 100%. Do not bonding-sell.
7. Confirm UI: Eligible / Graduating, not Graduated · Meteora. Bonding sell refused (`CurveClosed` or `SOLANA_CURVE_CLOSED`).
8. On-chain: `curve_closed == true`, `graduated == false`.
9. Run keeper / `graduate.mjs` with send enabled.
10. On-chain: `graduated == true`. Indexer has `CampaignGraduated`.
11. Reload: Meteora page. Meteora buy + sell succeed. Bonding sell fails `AlreadyGraduated`. Bar cannot unwind.

---

## Verification (must all pass)

- [ ] Fresh campaign PDA recorded.
- [ ] Overshoot buy (more SOL than remaining target) fills and closes the curve.
- [ ] Bonding sell after 100% is refused at auth and on-chain.
- [ ] `graduated` still false until keeper TX confirms.
- [ ] Atomic graduation TX succeeds (`GRADUATED`, pool, position).
- [ ] Token page mounts Meteora only after on-chain `graduated`.
- [ ] Meteora buy and sell both succeed.
- [ ] Bonding sell after confirm fails `AlreadyGraduated`.
- [ ] Progress stays at 100%.
- [ ] Reloading the page does not bounce back to bonding.

If someone bonding-sells at step 6 on the old binary, that is the old bug, not this test.

---

## Time box

This is a few hours, not a week, if we stay inside this file list and do not reopen BNB, latches, or LP fees.

Suggested order of work: program + error + tests → trade-auth v2 → frontend decode/UI honesty → keeper wrapper → deploy → one new campaign rehearsal.
