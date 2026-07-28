use anchor_lang::prelude::*;

use crate::{
    ClusterProfile, CreatorProfile, GenerationConfig, GlobalConfig, RiskProfile,
    CLUSTER_PROFILE_SEED, CREATOR_PROFILE_SEED, GENERATION_CONFIG_SEED, GLOBAL_CONFIG_SEED,
    RISK_PROFILE_SEED, EMPTY_CLUSTER_ID, LaunchpadError,
};

pub const CAMPAIGN_SEED: &[u8] = b"campaign";
pub const CREATE_AUTH_SEED: &[u8] = b"create-auth";

#[derive(Accounts)]
#[instruction(args: CreateCampaignArgs)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    pub route_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        seeds = [GENERATION_CONFIG_SEED, generation_config.generation_id.as_ref()],
        bump = generation_config.bump
    )]
    pub generation_config: Account<'info, GenerationConfig>,
    #[account(
        mut,
        seeds = [CREATOR_PROFILE_SEED, creator.key().as_ref()],
        bump = creator_profile.bump
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(
        seeds = [RISK_PROFILE_SEED, creator.key().as_ref()],
        bump = risk_profile.bump
    )]
    pub risk_profile: Account<'info, RiskProfile>,
    #[account(
        seeds = [CLUSTER_PROFILE_SEED, risk_profile.cluster_id.as_ref()],
        bump = cluster_profile.bump
    )]
    pub cluster_profile: Account<'info, ClusterProfile>,
    #[account(
        init,
        payer = creator,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [CAMPAIGN_SEED, args.campaign_id.as_ref()],
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        init,
        payer = creator,
        space = 8 + CreateAuthorization::INIT_SPACE,
        seeds = [CREATE_AUTH_SEED, creator.key().as_ref(), args.nonce.as_ref()],
        bump
    )]
    pub create_authorization: Account<'info, CreateAuthorization>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub campaign_id: [u8; 32],
    pub generation_id: [u8; 32],
    pub generation_config: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub metadata_hash: [u8; 32],
    pub route_profile_hash: [u8; 32],
    pub created_at: i64,
    pub sold_tokens: u64,
    pub net_raised_lamports: u64,
    pub total_buy_volume_lamports: u64,
    pub total_sell_volume_lamports: u64,
    pub buyer_count: u64,
    pub creator_bought_tokens: u64,
    pub graduated: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CreateAuthorization {
    pub creator: Pubkey,
    pub nonce: [u8; 32],
    pub deadline: i64,
    pub used_at: i64,
    pub route_signer: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct CreateCampaignArgs {
    pub campaign_id: [u8; 32],
    pub mint: Pubkey,
    pub metadata_hash: [u8; 32],
    pub route_profile_hash: [u8; 32],
    pub deadline: i64,
    pub nonce: [u8; 32],
}

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub campaign_id: [u8; 32],
    pub generation_id: [u8; 32],
    pub generation_config: Pubkey,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub metadata_hash: [u8; 32],
    pub route_profile_hash: [u8; 32],
    pub route_signer: Pubkey,
    pub created_at: i64,
}

pub fn create_campaign_handler(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;

    let global = &ctx.accounts.global_config;
    require_create_enabled(global)?;
    validate_create_args(&args, now)?;
    validate_route_authority(global, ctx.accounts.route_authority.key())?;
    validate_campaign_generation(global, &ctx.accounts.generation_config)?;
    validate_creator_can_launch(&ctx.accounts.creator_profile, now)?;
    validate_create_risk_profiles(
        ctx.accounts.creator.key(),
        &ctx.accounts.risk_profile,
        &ctx.accounts.cluster_profile,
    )?;

    let campaign = &mut ctx.accounts.campaign;
    campaign.campaign_id = args.campaign_id;
    campaign.generation_id = ctx.accounts.generation_config.generation_id;
    campaign.generation_config = ctx.accounts.generation_config.key();
    campaign.creator = ctx.accounts.creator.key();
    campaign.mint = args.mint;
    campaign.metadata_hash = args.metadata_hash;
    campaign.route_profile_hash = args.route_profile_hash;
    campaign.created_at = now;
    campaign.sold_tokens = 0;
    campaign.net_raised_lamports = 0;
    campaign.total_buy_volume_lamports = 0;
    campaign.total_sell_volume_lamports = 0;
    campaign.buyer_count = 0;
    campaign.creator_bought_tokens = 0;
    campaign.graduated = false;
    campaign.bump = ctx.bumps.campaign;

    let create_authorization = &mut ctx.accounts.create_authorization;
    create_authorization.creator = ctx.accounts.creator.key();
    create_authorization.nonce = args.nonce;
    create_authorization.deadline = args.deadline;
    create_authorization.used_at = now;
    create_authorization.route_signer = ctx.accounts.route_authority.key();
    create_authorization.bump = ctx.bumps.create_authorization;

    let creator_profile = &mut ctx.accounts.creator_profile;
    creator_profile.live_bonding_count = creator_profile
        .live_bonding_count
        .checked_add(1)
        .ok_or(LaunchpadError::MathOverflow)?;
    creator_profile.total_launches = creator_profile
        .total_launches
        .checked_add(1)
        .ok_or(LaunchpadError::MathOverflow)?;
    creator_profile.last_launch_timestamp = now;

    emit!(CampaignCreated {
        campaign: campaign.key(),
        campaign_id: campaign.campaign_id,
        generation_id: campaign.generation_id,
        generation_config: campaign.generation_config,
        creator: campaign.creator,
        mint: campaign.mint,
        metadata_hash: campaign.metadata_hash,
        route_profile_hash: campaign.route_profile_hash,
        route_signer: create_authorization.route_signer,
        created_at: campaign.created_at,
    });

    Ok(())
}

pub(crate) fn require_create_enabled(global: &GlobalConfig) -> Result<()> {
    require!(!global.paused, LaunchpadError::LaunchpadPaused);
    require!(!global.create_paused, LaunchpadError::CreatePaused);
    require!(global.route_authorization_required, LaunchpadError::InvalidCreateAuthorization);
    Ok(())
}

pub(crate) fn validate_route_authority(global: &GlobalConfig, route_authority: Pubkey) -> Result<()> {
    require_keys_eq!(global.route_signer, route_authority, LaunchpadError::Unauthorized);
    Ok(())
}

pub(crate) fn validate_create_args(args: &CreateCampaignArgs, now: i64) -> Result<()> {
    require!(args.campaign_id != [0; 32], LaunchpadError::InvalidCampaign);
    require_keys_neq!(args.mint, Pubkey::default(), LaunchpadError::InvalidCampaign);
    require!(args.metadata_hash != [0; 32], LaunchpadError::InvalidMetadata);
    require!(args.route_profile_hash != [0; 32], LaunchpadError::InvalidRouteProfile);
    require!(args.nonce != [0; 32], LaunchpadError::InvalidNonce);
    require!(args.deadline >= now, LaunchpadError::CreateAuthorizationExpired);
    Ok(())
}

pub(crate) fn validate_campaign_generation(global: &GlobalConfig, generation: &GenerationConfig) -> Result<()> {
    require!(generation.support_enabled, LaunchpadError::CampaignGenerationInactive);
    require!(generation.active_creation, LaunchpadError::CampaignGenerationInactive);
    require!(
        global.active_generation_id == generation.generation_id,
        LaunchpadError::CampaignGenerationInactive
    );
    require!(generation.route_authorization_required, LaunchpadError::InvalidCreateAuthorization);
    require!(generation.authorized_trading_required, LaunchpadError::InvalidCreateAuthorization);
    Ok(())
}

pub(crate) fn validate_creator_can_launch(profile: &CreatorProfile, now: i64) -> Result<()> {
    require!(!profile.restricted, LaunchpadError::CreatorRestricted);
    require!(
        !profile.manual_review_required,
        LaunchpadError::CreatorManualReviewRequired
    );
    require!(
        profile.live_bonding_count < profile.max_live_bonding_count,
        LaunchpadError::CreatorLaunchLimitExceeded
    );

    if profile.last_launch_timestamp > 0 {
        let next_allowed = profile
            .last_launch_timestamp
            .checked_add(profile.cooldown_seconds as i64)
            .ok_or(LaunchpadError::MathOverflow)?;
        require!(now >= next_allowed, LaunchpadError::CreatorCooldownActive);
    }

    Ok(())
}

pub(crate) fn validate_create_risk_profiles(
    creator: Pubkey,
    risk_profile: &RiskProfile,
    cluster_profile: &ClusterProfile,
) -> Result<()> {
    require_keys_eq!(risk_profile.wallet, creator, LaunchpadError::InvalidRiskProfile);
    require!(risk_profile.cluster_id != EMPTY_CLUSTER_ID, LaunchpadError::InvalidCluster);
    require!(!risk_profile.restricted, LaunchpadError::WalletRestricted);
    require!(
        !risk_profile.manual_review_required,
        LaunchpadError::CreatorManualReviewRequired
    );
    require!(
        cluster_profile.cluster_id == risk_profile.cluster_id,
        LaunchpadError::InvalidCluster
    );
    require!(!cluster_profile.restricted, LaunchpadError::ClusterRestricted);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        DEX_ADAPTER_METEORA_DAMM_V2, CREATOR_TIER_1, EMPTY_GENERATION_ID,
        TIER_1_MAX_LIVE_BONDING,
    };

    fn test_global(route_signer: Pubkey, active_generation_id: [u8; 32]) -> GlobalConfig {
        GlobalConfig {
            admin: Pubkey::new_unique(),
            pauser: Pubkey::new_unique(),
            tier_admin: Pubkey::new_unique(),
            risk_admin: Pubkey::new_unique(),
            route_signer,
            reward_operator: Pubkey::new_unique(),
            treasury_operator: Pubkey::new_unique(),
            generation_operator: Pubkey::new_unique(),
            active_generation_id,
            generation_count: 1,
            paused: false,
            create_paused: false,
            buy_paused: true,
            sell_paused: true,
            graduation_paused: true,
            claims_paused: true,
            route_authorization_required: true,
            authorized_trading_required: true,
            security_defaults_locked: true,
            bump: 255,
        }
    }

    fn test_generation(generation_id: [u8; 32]) -> GenerationConfig {
        GenerationConfig {
            generation_id,
            program_id: crate::id(),
            config_pda: Pubkey::new_unique(),
            start_slot: 42,
            dex_adapter: DEX_ADAPTER_METEORA_DAMM_V2,
            active_creation: true,
            support_enabled: true,
            manifest_hash: [9; 32],
            route_authorization_required: true,
            authorized_trading_required: true,
            bump: 254,
        }
    }

    fn test_creator_profile(wallet: Pubkey) -> CreatorProfile {
        CreatorProfile {
            wallet,
            tier: CREATOR_TIER_1,
            trust_score: 7_000,
            live_bonding_count: 0,
            last_launch_timestamp: 0,
            total_launches: 0,
            successful_graduations: 0,
            restricted: false,
            manual_review_required: false,
            creator_buy_cap_bps: 1_000,
            max_live_bonding_count: TIER_1_MAX_LIVE_BONDING,
            cooldown_seconds: 86_400,
            creator_buy_lock_seconds: 86_400,
            bump: 253,
        }
    }

    fn test_risk_profile(wallet: Pubkey, cluster_id: [u8; 32]) -> RiskProfile {
        RiskProfile {
            wallet,
            risk_level: 1,
            restricted: false,
            cluster_id,
            manual_review_required: false,
            bump: 252,
        }
    }

    fn test_cluster_profile(cluster_id: [u8; 32]) -> ClusterProfile {
        ClusterProfile {
            cluster_id,
            size: 2,
            risk_level: 1,
            restricted: false,
            bump: 251,
        }
    }

    fn test_create_args(deadline: i64) -> CreateCampaignArgs {
        CreateCampaignArgs {
            campaign_id: [1; 32],
            mint: Pubkey::new_unique(),
            metadata_hash: [2; 32],
            route_profile_hash: [3; 32],
            deadline,
            nonce: [4; 32],
        }
    }

    #[test]
    fn create_args_reject_empty_metadata_hash() {
        let mut args = test_create_args(200);
        args.metadata_hash = [0; 32];

        assert!(validate_create_args(&args, 100).is_err());
    }

    #[test]
    fn create_args_reject_expired_deadline() {
        let args = test_create_args(99);

        assert!(validate_create_args(&args, 100).is_err());
    }

    #[test]
    fn create_args_reject_empty_nonce() {
        let mut args = test_create_args(200);
        args.nonce = [0; 32];

        assert!(validate_create_args(&args, 100).is_err());
    }

    #[test]
    fn campaign_generation_requires_active_supported_generation() {
        let generation_id = [8; 32];
        let global = test_global(Pubkey::new_unique(), generation_id);
        let generation = test_generation(generation_id);

        assert!(validate_campaign_generation(&global, &generation).is_ok());

        let inactive_global = test_global(Pubkey::new_unique(), EMPTY_GENERATION_ID);
        assert!(validate_campaign_generation(&inactive_global, &generation).is_err());
    }

    #[test]
    fn route_authority_must_match_global_signer() {
        let route_signer = Pubkey::new_unique();
        let global = test_global(route_signer, [8; 32]);

        assert!(validate_route_authority(&global, route_signer).is_ok());
        assert!(validate_route_authority(&global, Pubkey::new_unique()).is_err());
    }

    #[test]
    fn creator_launch_rejects_live_count_at_limit() {
        let wallet = Pubkey::new_unique();
        let mut profile = test_creator_profile(wallet);
        profile.live_bonding_count = profile.max_live_bonding_count;

        assert!(validate_creator_can_launch(&profile, 1_700_000_000).is_err());
    }

    #[test]
    fn creator_launch_rejects_active_cooldown() {
        let wallet = Pubkey::new_unique();
        let mut profile = test_creator_profile(wallet);
        profile.last_launch_timestamp = 1_700_000_000;

        assert!(validate_creator_can_launch(&profile, 1_700_010_000).is_err());
    }

    #[test]
    fn creator_launch_rejects_restricted_creator() {
        let wallet = Pubkey::new_unique();
        let mut profile = test_creator_profile(wallet);
        profile.restricted = true;

        assert!(validate_creator_can_launch(&profile, 1_700_100_000).is_err());
    }

    #[test]
    fn risk_profiles_reject_restricted_wallet() {
        let wallet = Pubkey::new_unique();
        let cluster_id = [6; 32];
        let mut risk = test_risk_profile(wallet, cluster_id);
        risk.restricted = true;
        let cluster = test_cluster_profile(cluster_id);

        assert!(validate_create_risk_profiles(wallet, &risk, &cluster).is_err());
    }

    #[test]
    fn risk_profiles_reject_restricted_cluster() {
        let wallet = Pubkey::new_unique();
        let cluster_id = [6; 32];
        let risk = test_risk_profile(wallet, cluster_id);
        let mut cluster = test_cluster_profile(cluster_id);
        cluster.restricted = true;

        assert!(validate_create_risk_profiles(wallet, &risk, &cluster).is_err());
    }

    #[test]
    fn risk_profiles_require_matching_cluster() {
        let wallet = Pubkey::new_unique();
        let risk = test_risk_profile(wallet, [6; 32]);
        let cluster = test_cluster_profile([7; 32]);

        assert!(validate_create_risk_profiles(wallet, &risk, &cluster).is_err());
    }
}
