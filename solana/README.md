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
- Global/create pause controls
- Creator tier rules
- Creator launch cooldown
- Max live bonding count
- Creator buy lock
- Creator buy cap
- Wallet/cluster restriction checks
- Campaign pause controls
- Graduation state accounting
- Anchor test scaffold

Not yet implemented in this scaffold:

- SPL mint creation and mint authority wiring
- Bonding curve token pricing
- SOL fee vault transfers
- League/creator/recruiter/squad vault accounting
- Buy/sell token account CPI flows
- Graduation liquidity flow
- Backend indexer
- Frontend SolanaLaunchpadAdapter transaction builder

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

This folder starts Phase 6:

- TASK-S-001 Create Anchor workspace
- TASK-S-002 Implement GlobalConfig PDA
- TASK-S-003 Implement CreatorProfile PDA
- TASK-S-004 Implement CampaignState PDA
- TASK-S-005 Implement RiskProfile PDA
- TASK-S-006 Implement ClusterProfile PDA
- TASK-S-008 Implement create_campaign scaffold
- TASK-S-009 Implement buy scaffold
- TASK-S-010 Implement sell scaffold
- TASK-S-011 Implement graduate scaffold
- TASK-S-012 Implement pause instructions
- TASK-S-013 Implement tier/risk admin instructions
- TASK-S-014 Add initial Anchor tests
