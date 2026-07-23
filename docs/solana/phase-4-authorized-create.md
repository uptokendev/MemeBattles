# Solana Phase 4 Authorized Create Foundation

Status date: 2026-07-23
Branch: agent/solana-phase0-source-of-truth

## What This Slice Adds

This slice starts Phase 4 by adding the on-chain foundation for authorized Solana campaign creation, hardening the frontend adapter so stale Solana transaction code cannot accidentally become live, and adding the backend authorization contract shape for Solana create. It does not enable public Solana create, buy, sell, or graduation flows.

Updated files:

| Path | Purpose |
| --- | --- |
| `programs/memewarzone_solana/src/lib.rs` | Wires the `create_campaign` instruction into the Anchor program and extends shared launchpad errors. |
| `programs/memewarzone_solana/src/authorized_create.rs` | Adds Campaign and CreateAuthorization PDAs, create args, route-signer authorization checks, creator/risk/generation launch checks, replay-resistant nonce PDA shape, and tests. |
| `frontend/src/lib/launchpad/adapters/solanaLaunchpadAdapter.ts` | Keeps Solana in protocol_pending unless explicit Phase 4 live-transaction and authorized-create-client env gates are set; removes the older experimental transaction builder from the active adapter path. |
| `frontend/api/dev-fix/solana-launchpad.js` | Adds Solana create preflight and create-authorization response builders with canonical metadata hash, route profile hash, campaign ID, nonce, deadline, generation ID, program ID, and route signer identity. |
| `frontend/api/dev-fix/route-auth.js` | Delegates `/api/routing/status` and `/api/routing/create-authorization` to the Solana backend contract when `chainId=101`, leaving the BNB route-authority path unchanged. |

## Implemented Phase 4 Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Program-owned economics | Started | `create_campaign` accepts metadata, route profile, mint, deadline, nonce, and campaign identity only. It stores the active GenerationConfig identity and does not accept creator-controlled economics. |
| Authorized create route | Started | The program requires a route authority signer matching `GlobalConfig.route_signer`. The backend now returns the canonical route authorization payload shape for `chainId=101`; backend-side transaction signing remains gated. |
| Replay protection | Started | `CreateAuthorization` is initialized with seeds `[create-auth, creator, nonce]`, so the same creator/nonce cannot be reused. Backend authorization returns a fresh 32-byte nonce for each accepted request. |
| Deadline enforcement | Started | Expired create authorization deadlines are rejected before state is written. Backend authorization returns `deadline` and `validUntil`. |
| Active generation check | Started | Creation requires the selected generation to be support-enabled, active for creation, and equal to `GlobalConfig.active_generation_id`. Backend authorization includes the configured active generation ID. |
| Creator eligibility | Started | Creation rejects restricted/manual-review creators, live bonding count at tier limit, and active cooldowns. Successful create increments live bonding count and total launches. |
| Wallet and cluster risk | Started | Creation rejects restricted wallets, manual-review wallets, empty/mismatched clusters, and restricted clusters. |
| Campaign state | Started | Campaign stores creator, mint, generation ID/config, metadata hash, route profile hash, created timestamp, volume counters, net raised, creator-bought counter, and graduation flag. |
| Frontend gating | Started | Solana adapter now remains protocol_pending even when a program ID is configured, until `VITE_ENABLE_SOLANA_LAUNCHPAD_TRANSACTIONS` and `VITE_SOLANA_AUTHORIZED_CREATE_CLIENT_READY` are explicitly true. |
| Backend gating | Started | Solana create authorization remains blocked unless `SOLANA_AUTHORIZED_CREATE_BACKEND_READY=true`, program ID, route signer, and generation ID are configured. |

## Backend Contract Shape

`POST /api/routing/create-authorization` with `chainId: 101` returns Solana-specific data once the backend gate is enabled:

- `campaignId` / `campaignIdHex`
- `metadataHash` / `metadataHashHex`
- `routeProfileHash` / `routeProfileHashHex`
- `nonce` / `nonceHex`
- `deadline` and `validUntil`
- `generationId` / `generationIdHex`
- `programId`
- `routeSigner`
- `routeAuthorizationMode: route_signer_transaction_signature`

Until the gate is enabled, the endpoint returns `SOLANA_PROTOCOL_PENDING` with the same preflight envelope so the frontend can display a clear locked state.

## Still Pending In Phase 4

- Backend/admin job to sync CreatorProfile, RiskProfile, ClusterProfile, GlobalConfig, and GenerationConfig PDAs from canonical data.
- Frontend Solana create client that submits metadata-only create requests through the new Campaign/CreateAuthorization account shape.
- Route-signer transaction path or Ed25519 instruction/sysvar verification for detached route authorization signatures.
- Real vault/mint account wiring for the future bonding curve slice.
- Integration tests proving unauthorized create and replayed nonce fail at the transaction level.

## Gate Status

Solana create remains protocol_pending. This slice adds the guarded program state path, frontend safety gate, and backend authorization contract that later backend and frontend work can call after the launchpad is ready for devnet proof.
