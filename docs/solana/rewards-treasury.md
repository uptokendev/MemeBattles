# Solana rewards treasury

On-chain league and airdrop pots. Not HuKfoF. Not an API-drained wallet.

**Program ID (devnet, live):** `2NzthKEZHtbnqXxT4eeEnEQRHkQsdqgqVsfzcCCoZBKX`

PDAs (created 2026-08-15, claims still off):

- config `FHtimMcBY5Wn8KC3abxMh6NvzDfSu2LHY6HZFUDTkRmt`
- **league vault** `FAKPndjQa3XppkNdk8SDGGWbZG2cPWJWhsDR2EWE9yWK`
- **airdrop vault** `BE9ubLmT1M1N976ABCc9DpYo4iaeRJ4DHEXLCksrGQk4`

Explorer (devnet):

- [league vault](https://explorer.solana.com/address/FAKPndjQa3XppkNdk8SDGGWbZG2cPWJWhsDR2EWE9yWK?cluster=devnet)
- [airdrop vault](https://explorer.solana.com/address/BE9ubLmT1M1N976ABCc9DpYo4iaeRJ4DHEXLCksrGQk4?cluster=devnet)

Those two addresses are the on-chain pots. Rent-exempt lamports you see now are account rent, not prize money. Prize SOL arrives after V4 is upgraded and a buy/sell passes these PDAs.

Full BNB-matching vaults (devnet, initialized):

| Lane | PDA |
|---|---|
| Weekly league | `FAKPndjQa3XppkNdk8SDGGWbZG2cPWJWhsDR2EWE9yWK` |
| Monthly league | `68FNNeXDMAU8XaJsNYL4VFY2YnprnE36LCncCm8uRyJg` |
| Airdrop | `BE9ubLmT1M1N976ABCc9DpYo4iaeRJ4DHEXLCksrGQk4` |
| Recruiter | `54WorKCYLiV3SGe4jcRGLBcdSvvQFggm9mgrBavAkZ53` |
| Squad | `HBAidAC6D51S7TAzNmMpZBAEp74Ld6tj9KnVXLH3mN55` |
| Protocol (multisig pot) | `BvQHb6qq22ZHAVUpXaaeizBaRhGpuu5T3i8Y3ebZ2que` |

Trades currently route the **Unlinked** table (BNB factory default): league 75 bps (30/70 weekly/monthly), airdrop 30 bps, protocol remainder. Linked/OG profiles need the signed route_profile (next). Operator is filled from the protocol vault up to **$10k** via `flush_operator_fill`.

PDAs:

- `["rewards_config"]` — authority + `claims_enabled`
- `["league_vault"]` — SOL balance **is** the league pot
- `["airdrop_vault"]` — SOL balance **is** the airdrop pot
- `["league_epoch", period, epoch_start_le]` — sealed merkle root
- `["league_claim", period, epoch_start_le, category_hash, rank]` — one claim receipt

## Fee routing

V4 buy/sell take the existing 2% fee. If the client passes the two vault PDAs as remaining accounts:

- 75 bps of gross → `league_vault`
- 50 bps of gross → `airdrop_vault`
- leftover 75 bps stays in the campaign `sol_vault`

Trader fee is unchanged. Curve `net` is unchanged.

## Deploy order

1. `anchor build` (workspace now includes `mwz_rewards_treasury`).
2. Deploy treasury program. If the program ID changes, update `declare_id!`, `REWARDS_TREASURY_PROGRAM_ID` in V4, `frontend/src/lib/solanaRewardsTreasury.ts`, and `SOLANA_REWARDS_TREASURY_PROGRAM_ID`.
3. `initialize` (protocol authority, not the harvest operator).
4. Upgrade V4 so buy/sell can skim fee slices.
5. Ship frontend trade remaining-accounts (already in `solanaTradeV1.ts`).
6. After live buys fill `league_vault`, `set_league_epoch_root` then `set_claims_enabled(true)`.
7. Winners claim via Profile → Rewards (`claim_league`).

Claims stay closed (`claims_enabled = false`) until fees have actually landed in the PDAs.
