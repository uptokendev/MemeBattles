# Solana Phase 2 Generation Registry

Status date: 2026-07-23
Branch: agent/solana-phase0-source-of-truth

## What This Slice Adds

This slice starts the Solana generation registry in the Anchor program. It keeps the public UX generation-neutral while giving the program a first-class record of which generation can create and which generations remain supported.

Added/updated program pieces:

| Program piece | Purpose |
| --- | --- |
| `GenerationConfig` PDA | Stores generation identity, program/config PDA identity, start slot, DEX adapter, support state, active-creation state, manifest hash, and locked route defaults. |
| `GlobalConfig.active_generation_id` | Records the single generation currently allowed to create. Empty means no Solana generation can create. |
| `GlobalConfig.generation_count` | Counts initialized generation configs. |
| `initialize_generation_config` | Creates a new generation config under `generation` seed plus generation ID. |
| `set_generation_support` | Toggles support and active-creation flags using admin/generation-operator authority. |

## Implemented Phase 2 Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Store generation ID | Started | `generation_id` is a 32-byte stable ID. |
| Store program ID/config PDA/start slot | Started | `program_id`, `config_pda`, and `start_slot` are stored on `GenerationConfig`. |
| Store active creation/support flags | Started | `active_creation` and `support_enabled` live on each generation. |
| Enforce one active creation generation | Started | `GlobalConfig.active_generation_id` prevents initializing or activating a second creation generation while one is active. |
| Keep supported generations tradable/graduatable | Scaffolded | The support flag exists; campaign/trade/graduation logic still needs to consume it in later phases. |
| Store DEX adapter | Started | `dex_adapter` supports Meteora DAMM v2 and Raydium CPMM constants. |
| Store manifest hash | Started | `manifest_hash` stores the off-chain deployment manifest hash. |
| Preserve route/security defaults | Started | Generation settings require route authorization and authorized trading to remain true. |

## DEX Adapter Constants

```text
1 = Meteora DAMM v2
2 = Raydium CPMM
```

## Remaining Phase 2 Gates

- Add Anchor tests for old/new generation coexistence.
- Add backend table or generic generation extension for Solana generation records.
- Add indexer cursor persistence per Solana generation.
- Update public campaign feeds to query all supported generations once the Solana indexer exists.
- Ensure create authorization only targets the active generation.
- Ensure trade authorization resolves a campaign's original generation after Campaign PDA exists.

This is still a foundation slice. It does not make Solana create, trade, graduation, or claims live.
