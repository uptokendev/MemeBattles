# Activity Feed Plan (Profile)

This document outlines the event-indexing plan for the Profile Activity feed, the API contract, and the aggregation rules. The goal is to power **Trades / Comments / Created / Interactions** without heavy per-campaign polling.

## 1) Schema (event store)
We will use the existing `activity_events` table (see `db/migrations/001_init.sql`) as a unified append-only event log. It is chain-aware, wallet-aware, and can be queried by actor/campaign/token.

### Core event types
- `CREATE_CAMPAIGN` — emitted when a new campaign is created
- `BUY` / `SELL` — emitted when curve trades happen
- `COMMENT` — emitted when a user posts on a token
- `UPVOTE` — emitted from VoteTreasury
- `FINALIZE` — campaign graduation

### Event keying
- `chain_id + tx_hash + log_index` for on-chain events
- `chain_id + comment_id` for comment events (store in `meta` as `comment_id`)

## 2) API contract (profile activity)
We expose small, focused endpoints per tab. Each endpoint returns:
```
{
  items: ActivityItem[]
  nextCursor: string | null
}
```
`nextCursor` enables pagination; format is `blockNumber:logIndex` for on-chain sources.

### Implemented now
- `GET /api/activity/trades?chainId=97&address=0x...&limit=50&cursor=BLOCK:LOG`
  - Source: `curve_trades` (joined with `campaigns` for display fields)
- `GET /api/activity/comments?chainId=97&address=0x...&limit=50&cursor=TS:ID`
  - Source: `token_comments` (joined with `campaigns` for display fields)
- `GET /api/activity/created?chainId=97&address=0x...&limit=50&cursor=TS:ADDR`
  - Source: `campaigns` where `creator_address = address`
- `GET /api/activity/interactions?chainId=97&address=0x...&limit=50&cursor=BLOCK:LOG`
  - Source: `votes` (VoteTreasury), joined with `campaigns`

### Planned
- Combined feed endpoint: `GET /api/activity/feed` (mix of all types, de-duped and sorted)

## 3) Feed aggregation rules
When we build a **combined** feed (optional future), the aggregation rules are:
- Normalize each item to `{type, ts, address, campaign, txHash, meta}`
- **Sort by descending timestamp**, then `block_number`, then `log_index`
- De-dupe by `type + tx_hash + log_index` (or `comment_id` for comments)
- Apply per-type limits to avoid large single-source bursts

## 4) Indexer responsibilities (next iteration)
Extend `realtime-indexer` to append to `activity_events` as events are indexed:
- Factory `CampaignCreated` -> `CREATE_CAMPAIGN`
- Campaign `TokensPurchased` -> `BUY`
- Campaign `TokensSold` -> `SELL`
- VoteTreasury `VoteCast` -> `UPVOTE`
- Comment API -> `COMMENT` (write event at comment creation time)

This keeps Profile Activity fast, unified, and reliable.
