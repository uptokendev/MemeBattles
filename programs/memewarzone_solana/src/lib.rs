use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWxTWqjRZ6LkZXoC3XgXvAqUixG");

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global";

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

#[error_code]
pub enum LaunchpadError {
    #[msg("The signer is not authorized for this Solana launchpad action.")]
    Unauthorized,
    #[msg("Authority addresses must be set before initializing the launchpad.")]
    InvalidAuthority,
    #[msg("Security defaults have already been locked and cannot be weakened.")]
    SecurityDefaultsAlreadyLocked,
}
