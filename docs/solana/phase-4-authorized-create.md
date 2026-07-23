# Solana Phase 4 Authorized Create Foundation

Status date: 2026-07-23
Branch: agent/solana-phase0-source-of-truth

## What This Slice Adds

This slice starts Phase 4 by adding the on-chain foundation for authorized Solana campaign creation. It does not enable public Solana create, buy, sell, or graduation flows.

Updated files:

| Path | Purpose |
| --- | --- |
| `programs/memewarzone_solana/src/lib.rs` | Wires the `create_campaign` instruction into the Anchor program and extends shared launchpad errors. |
| `programs/memewarzone_solana/src/authorized_create.rs` | Adds Campaign and CreateAuthorization PDAs, create args, route-signer authorization checks, creator/risk/generation launch checks, replay-resistant nonce PDA shape, and tests. |

## Implemented Phase 4 Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Program-owned economics | Started | `create_campaign` accepts metadata, route profile, mint, deadline, nonce, and campaign identity only. It stores the active GenerationConfig identity and does not accept creator-controlled economics. |
| Authorized create route | Started | The instruction requires a route authority signer matching `GlobalConfig.route_signer`. Backend signed payload construction remains outside this slice. |
| Replay protection | Started | `CreateAuthorization` is initialized with seeds `[create-auth, creator, nonce]`, so the same creator/nonce cannot be reused. |
| Deadline enforcement | Started | Expired create authorization deadlines are rejected before state is written. |
| Active generation check | Started | Creation requires the selected generation to be support-enabled, active for creation, and equal to `GlobalConfig.active_generation_id`. |
| Creator eligibility | Started | Creation rejects restricted/manual-review creators, live bonding count at tier limit, and active cooldowns. Successful create increments live bonding count and total launches. |
| Wallet and cluster risk | Started | Creation rejects restricted wallets, manual-review wallets, empty/mismatched clusters, and restricted clusters. |
| Campaign state | Started | Campaign stores creator, mint, generation ID/config, metadata hash, route profile hash, created timestamp, volume counters, net raised, creator-bought counter, and graduation flag. |

## Still Pending In Phase 4

- Backend Solana create preflight endpoint and exact signed payload format.
- Ed25519 instruction/sysvar verification for detached route authorization signatures, if we choose signature verification instead of route-authority transaction signing.
- Frontend Solana create client that submits metadata-only create requests.
- Real vault/mint account wiring for the future bonding curve slice.
- Integration tests proving unauthorized create and replayed nonce fail at the transaction level.

## Gate Status

Solana create remains protocol_pending. This slice only adds the guarded program state path that later backend and frontend work can call after the launchpad is ready for devnet proof.
