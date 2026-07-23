use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG");

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global";
pub const GENERATION_CONFIG_SEED: &[u8] = b"generation";
pub const EMPTY_GENERATION_ID: [u8; 32] = [0; 32];

pub const DEX_ADAPTER_METEORA_DAMM_V2: u8 = 1;
pub const DEX_ADAPTER_RAYDIUM_CPMM: u8 = 2;

#[program]
pub mod memewarzone_solana {
    use super::*;

    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        authorities: GlobalAuthorities,
    ) -> Result<()> {
        require_keys_neq!(authorities.admin, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.pauser, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.tier_admin, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.risk_admin, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.route_signer, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.reward_operator, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.treasury_operator, Pubkey::default(), LaunchpadError::InvalidAuthority);
        require_keys_neq!(authorities.generation_operator, Pubkey::default(), LaunchpadError::InvalidAuthority);

        let global = &mut ctx.accounts.global_config;
        global.admin = authorities.admin;
        global.pauser = authorities.pauser;
        global.tier_admin = authorities.tier_admin;
        global.risk_admin = authorities.risk_admin;
        global.route_signer = authorities.route_signer;
        global.reward_operator = authorities.reward_operator;
        global.treasury_operator = authorities.treasury_operator;
        global.generation_operator = authorities.generation_operator;
        global.active_generation_id = EMPTY_GENERATION_ID;
        global.generation_count = 0;
        global.paused = false;
        global.create_paused = true;
        global.buy_paused = true;
        global.sell_paused = true;
        global.graduation_paused = true;
        global.claims_paused = true;
        global.route_authorization_required = true;
        global.authorized_trading_required = true;
        global.security_defaults_locked = false;
        global.bump = ctx.bumps.global_config;
        emit!(GlobalConfigInitialized {
            admin: global.admin,
            pauser: global.pauser,
            route_signer: global.route_signer,
        });
        Ok(())
    }

    pub fn set_pause_flags(ctx: Context<SetPauseFlags>, flags: PauseFlags) -> Result<()> {
        let global = &mut ctx.accounts.global_config;
        require_pause_authority(global, ctx.accounts.authority.key())?;

        global.paused = flags.paused;
        global.create_paused = flags.create_paused;
        global.buy_paused = flags.buy_paused;
        global.sell_paused = flags.sell_paused;
        global.graduation_paused = flags.graduation_paused;
        global.claims_paused = flags.claims_paused;

        emit!(PauseFlagsUpdated {
            authority: ctx.accounts.authority.key(),
            paused: global.paused,
            create_paused: global.create_paused,
            buy_paused: global.buy_paused,
            sell_paused: global.sell_paused,
            graduation_paused: global.graduation_paused,
            claims_paused: global.claims_paused,
        });
        Ok(())
    }

    pub fn lock_security_defaults(ctx: Context<LockSecurityDefaults>) -> Result<()> {
        let global = &mut ctx.accounts.global_config;
        require_admin(global, ctx.accounts.admin.key())?;
        require!(!global.security_defaults_locked, LaunchpadError::SecurityDefaultsAlreadyLocked);

        global.route_authorization_required = true;
        global.authorized_trading_required = true;
        global.security_defaults_locked = true;

        emit!(SecurityDefaultsLocked {
            admin: ctx.accounts.admin.key(),
            route_authorization_required: global.route_authorization_required,
            authorized_trading_required: global.authorized_trading_required,
        });
        Ok(())
    }

    pub fn initialize_generation_config(
        ctx: Context<InitializeGenerationConfig>,
        settings: GenerationSettings,
    ) -> Result<()> {
        let global = &mut ctx.accounts.global_config;
        require_generation_authority(global, ctx.accounts.authority.key())?;
        validate_generation_settings(global, &settings)?;

        let active_generation_id = global.active_generation_id;
        if settings.active_creation {
            require!(is_empty_generation_id(active_generation_id), LaunchpadError::ActiveCreationGenerationExists);
            global.active_generation_id = settings.generation_id;
        }

        let generation = &mut ctx.accounts.generation_config;
        generation.generation_id = settings.generation_id;
        generation.program_id = settings.program_id;
        generation.config_pda = settings.config_pda;
        generation.start_slot = settings.start_slot;
        generation.dex_adapter = settings.dex_adapter;
        generation.active_creation = settings.active_creation;
        generation.support_enabled = settings.support_enabled;
        generation.manifest_hash = settings.manifest_hash;
        generation.route_authorization_required = true;
        generation.authorized_trading_required = true;
        generation.bump = ctx.bumps.generation_config;
        global.generation_count = global.generation_count.checked_add(1).ok_or(LaunchpadError::MathOverflow)?;

        emit!(GenerationConfigInitialized {
            generation_id: generation.generation_id,
            program_id: generation.program_id,
            config_pda: generation.config_pda,
            start_slot: generation.start_slot,
            dex_adapter: generation.dex_adapter,
            active_creation: generation.active_creation,
            support_enabled: generation.support_enabled,
        });
        Ok(())
    }

    pub fn set_generation_support(
        ctx: Context<SetGenerationSupport>,
        support_enabled: bool,
        active_creation: bool,
    ) -> Result<()> {
        let global = &mut ctx.accounts.global_config;
        require_generation_authority(global, ctx.accounts.authority.key())?;
        require!(support_enabled || !active_creation, LaunchpadError::ActiveGenerationMustBeSupported);

        let generation = &mut ctx.accounts.generation_config;
        let current_active = global.active_generation_id;

        if active_creation {
            require!(
                is_empty_generation_id(current_active) || current_active == generation.generation_id,
                LaunchpadError::ActiveCreationGenerationExists
            );
            global.active_generation_id = generation.generation_id;
        } else if current_active == generation.generation_id {
            global.active_generation_id = EMPTY_GENERATION_ID;
        }

        generation.support_enabled = support_enabled;
        generation.active_creation = active_creation;

        emit!(GenerationSupportUpdated {
            generation_id: generation.generation_id,
            support_enabled: generation.support_enabled,
            active_creation: generation.active_creation,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPauseFlags<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct LockSecurityDefaults<'info> {
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(settings: GenerationSettings)]
pub struct InitializeGenerationConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + GenerationConfig::INIT_SPACE,
        seeds = [GENERATION_CONFIG_SEED, settings.generation_id.as_ref()],
        bump
    )]
    pub generation_config: Account<'info, GenerationConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetGenerationSupport<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        mut,
        seeds = [GENERATION_CONFIG_SEED, generation_config.generation_id.as_ref()],
        bump = generation_config.bump
    )]
    pub generation_config: Account<'info, GenerationConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub tier_admin: Pubkey,
    pub risk_admin: Pubkey,
    pub route_signer: Pubkey,
    pub reward_operator: Pubkey,
    pub treasury_operator: Pubkey,
    pub generation_operator: Pubkey,
    pub active_generation_id: [u8; 32],
    pub generation_count: u64,
    pub paused: bool,
    pub create_paused: bool,
    pub buy_paused: bool,
    pub sell_paused: bool,
    pub graduation_paused: bool,
    pub claims_paused: bool,
    pub route_authorization_required: bool,
    pub authorized_trading_required: bool,
    pub security_defaults_locked: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GenerationConfig {
    pub generation_id: [u8; 32],
    pub program_id: Pubkey,
    pub config_pda: Pubkey,
    pub start_slot: u64,
    pub dex_adapter: u8,
    pub active_creation: bool,
    pub support_enabled: bool,
    pub manifest_hash: [u8; 32],
    pub route_authorization_required: bool,
    pub authorized_trading_required: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GlobalAuthorities {
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub tier_admin: Pubkey,
    pub risk_admin: Pubkey,
    pub route_signer: Pubkey,
    pub reward_operator: Pubkey,
    pub treasury_operator: Pubkey,
    pub generation_operator: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct PauseFlags {
    pub paused: bool,
    pub create_paused: bool,
    pub buy_paused: bool,
    pub sell_paused: bool,
    pub graduation_paused: bool,
    pub claims_paused: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct GenerationSettings {
    pub generation_id: [u8; 32],
    pub program_id: Pubkey,
    pub config_pda: Pubkey,
    pub start_slot: u64,
    pub dex_adapter: u8,
    pub active_creation: bool,
    pub support_enabled: bool,
    pub manifest_hash: [u8; 32],
    pub route_authorization_required: bool,
    pub authorized_trading_required: bool,
}

#[event]
pub struct GlobalConfigInitialized {
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub route_signer: Pubkey,
}

#[event]
pub struct PauseFlagsUpdated {
    pub authority: Pubkey,
    pub paused: bool,
    pub create_paused: bool,
    pub buy_paused: bool,
    pub sell_paused: bool,
    pub graduation_paused: bool,
    pub claims_paused: bool,
}

#[event]
pub struct SecurityDefaultsLocked {
    pub admin: Pubkey,
    pub route_authorization_required: bool,
    pub authorized_trading_required: bool,
}

#[event]
pub struct GenerationConfigInitialized {
    pub generation_id: [u8; 32],
    pub program_id: Pubkey,
    pub config_pda: Pubkey,
    pub start_slot: u64,
    pub dex_adapter: u8,
    pub active_creation: bool,
    pub support_enabled: bool,
}

#[event]
pub struct GenerationSupportUpdated {
    pub generation_id: [u8; 32],
    pub support_enabled: bool,
    pub active_creation: bool,
}

fn require_admin(global: &GlobalConfig, authority: Pubkey) -> Result<()> {
    require_keys_eq!(global.admin, authority, LaunchpadError::Unauthorized);
    Ok(())
}

fn require_pause_authority(global: &GlobalConfig, authority: Pubkey) -> Result<()> {
    if authority == global.admin || authority == global.pauser {
        return Ok(());
    }
    err!(LaunchpadError::Unauthorized)
}

fn require_generation_authority(global: &GlobalConfig, authority: Pubkey) -> Result<()> {
    if authority == global.admin || authority == global.generation_operator {
        return Ok(());
    }
    err!(LaunchpadError::Unauthorized)
}

fn validate_generation_settings(global: &GlobalConfig, settings: &GenerationSettings) -> Result<()> {
    require!(settings.generation_id != EMPTY_GENERATION_ID, LaunchpadError::InvalidGeneration);
    require_keys_eq!(settings.program_id, crate::id(), LaunchpadError::InvalidGenerationProgram);
    require!(is_supported_dex_adapter(settings.dex_adapter), LaunchpadError::InvalidDexAdapter);
    require!(settings.support_enabled || !settings.active_creation, LaunchpadError::ActiveGenerationMustBeSupported);
    require!(settings.route_authorization_required, LaunchpadError::SecurityDefaultsCannotBeWeakened);
    require!(settings.authorized_trading_required, LaunchpadError::SecurityDefaultsCannotBeWeakened);
    if global.security_defaults_locked {
        require!(global.route_authorization_required, LaunchpadError::SecurityDefaultsCannotBeWeakened);
        require!(global.authorized_trading_required, LaunchpadError::SecurityDefaultsCannotBeWeakened);
    }
    Ok(())
}

fn is_supported_dex_adapter(dex_adapter: u8) -> bool {
    dex_adapter == DEX_ADAPTER_METEORA_DAMM_V2 || dex_adapter == DEX_ADAPTER_RAYDIUM_CPMM
}

fn is_empty_generation_id(generation_id: [u8; 32]) -> bool {
    generation_id == EMPTY_GENERATION_ID
}

#[error_code]
pub enum LaunchpadError {
    #[msg("The signer is not authorized for this Solana launchpad action.")]
    Unauthorized,
    #[msg("Authority addresses must be set before initializing the launchpad.")]
    InvalidAuthority,
    #[msg("Security defaults have already been locked and cannot be weakened.")]
    SecurityDefaultsAlreadyLocked,
    #[msg("Security defaults cannot be weakened for Solana launchpad generations.")]
    SecurityDefaultsCannotBeWeakened,
    #[msg("Generation ID, seed, or configuration is invalid.")]
    InvalidGeneration,
    #[msg("Generation program ID must match this deployed program.")]
    InvalidGenerationProgram,
    #[msg("Exactly one Solana generation can be active for creation.")]
    ActiveCreationGenerationExists,
    #[msg("An active creation generation must remain support-enabled.")]
    ActiveGenerationMustBeSupported,
    #[msg("Unsupported Solana DEX adapter mode.")]
    InvalidDexAdapter,
    #[msg("Arithmetic overflow while updating Solana launchpad state.")]
    MathOverflow,
}
