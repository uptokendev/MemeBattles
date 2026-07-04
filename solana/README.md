# MemeWarzone Solana Launchpad

Standalone Anchor workspace for the MemeWarzone protected pre-grad launchpad.

This scaffold mirrors the Phase 1 BNB safety layer and prepares the Solana protocol path without touching the existing BNB/frontend build flow.

## Current scope

Implemented scaffold:

- GlobalConfig PDA
- CreatorProfile PDA
- CampaignState PDA
- RiskProfile PDA
- ClusterProfile PDA
- FeeVault PDA
- Global/create pause controls
- Creator tier rules
- Creator launch cooldown
- Max live bonding count
- Creator buy lock
- Creator buy cap
- Wallet/cluster restriction checks
- Campaign pause controls
- SOL fee vault transfer on buy
- Protocol fee accounting on buy/sell
- Curve reserve accounting fields
- Graduation state accounting
- Anchor test scaffold for create, buy accounting, and creator buy lock

Not yet implemented in this scaffold:

- SPL mint creation and mint authority wiring
- SPL token mint/burn CPI flows for buy/sell
- Associated token account validation
- Final bonding curve pricing model beyond the current checked scaffold quote
- League/creator/recruiter/squad vault distribution claims
- Graduation liquidity flow
- Backend indexer
- Frontend SolanaLaunchpadAdapter transaction builder
- Devnet deploy address and generated IDL wiring

## Local validation

From the repo root:

```bash
cd solana
yarn install
anchor build
anchor test
```

The program id in `Anchor.toml` and `src/lib.rs` is currently the placeholder `11111111111111111111111111111111`. Replace it with the deployed program id after the first devnet deploy.

## Build plan mapping

This folder advances Phase 6:

- TASK-S-001 Create Anchor workspace
- TASK-S-002 Implement GlobalConfig PDA
- TASK-S-003 Implement CreatorProfile PDA
- TASK-S-004 Implement CampaignState PDA
- TASK-S-005 Implement RiskProfile PDA
- TASK-S-006 Implement ClusterProfile PDA
- TASK-S-007 Implement FeeVault PDA and SOL accounting scaffold
- TASK-S-008 Implement create_campaign scaffold
- TASK-S-009 Implement buy scaffold with SOL vault transfer
- TASK-S-010 Implement sell scaffold with vault refund accounting
- TASK-S-011 Implement graduate scaffold
- TASK-S-012 Implement pause instructions
- TASK-S-013 Implement tier/risk admin instructions
- TASK-S-014 Add initial Anchor tests

Next slices:

1. Add SPL mint and associated-token-account validation with `anchor-spl`.
2. Replace the scaffold quote with the final bonding curve math.
3. Add token mint/burn CPI flows for buy/sell.
4. Add fee distribution claim instructions for creator, recruiter, squad, and protocol authorities.
5. Generate IDL and wire the frontend Solana transaction builder.
