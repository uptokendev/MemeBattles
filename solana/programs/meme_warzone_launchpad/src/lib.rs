use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount};

// Placeholder program id for scaffold/dev. Replace after the first Anchor deploy.
declare_id!("11111111111111111111111111111111");

pub const TIER_NEW: u8 = 1;
pub const TIER_TRUSTED: u8 = 2;
pub const TIER_PROVEN: u8 = 3;

pub const RISK_LOW: u8 = 0;
pub const RISK_MEDIUM: u8 = 1;
pub const RISK_HIGH: u8 = 2;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod meme_warzone_launchpad {
    use super::*;

    pub fn initialize_global_config(ctx: Context<InitializeGlobalConfig>, args: InitializeGlobalConfigArgs) -> Result<()> {
        require_bps(args.trade_fee_bps)?;
        require_bps(args.graduation_fee_bps)?;
        let config = &mut ctx.accounts.global_config;
        config.admin = ctx.accounts.admin.key();
        config.pauser = args.pauser;
        config.risk_admin = args.risk_admin;
        config.tier_admin = args.tier_admin;
        config.fee_authority = args.fee_authority;
        config.global_paused = false;
        config.create_paused = false;
        config.trade_fee_bps = args.trade_fee_bps;
        config.graduation_fee_bps = args.graduation_fee_bps;
        config.bump = ctx.bumps.global_config;
        emit!(GlobalConfigInitialized { admin: config.admin });
        Ok(())
    }

    pub fn set_global_pause(ctx: Context<SetGlobalPause>, global_paused: bool, create_paused: bool) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(ctx.accounts.authority.key() == config.admin || ctx.accounts.authority.key() == config.pauser, LaunchpadError::Unauthorized);
        config.global_paused = global_paused;
        config.create_paused = create_paused;
        emit!(GlobalPauseUpdated { global_paused, create_paused });
        Ok(())
    }

    pub fn initialize_creator_profile(ctx: Context<InitializeCreatorProfile>) -> Result<()> {
        let profile = &mut ctx.accounts.creator_profile;
        profile.creator_wallet = ctx.accounts.creator.key();
        profile.tier = TIER_NEW;
        profile.trust_score = 0;
        profile.live_bonding_count = 0;
        profile.last_launch_timestamp = 0;
        profile.total_launches = 0;
        profile.successful_graduations = 0;
        profile.restricted = false;
        profile.manual_review_required = false;
        profile.bump = ctx.bumps.creator_profile;
        emit!(CreatorProfileInitialized { creator: profile.creator_wallet });
        Ok(())
    }

    pub fn set_creator_tier(ctx: Context<SetCreatorTier>, tier: u8, trust_score: u64, restricted: bool, manual_review_required: bool) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(ctx.accounts.authority.key() == config.admin || ctx.accounts.authority.key() == config.tier_admin, LaunchpadError::Unauthorized);
        require_valid_tier(tier)?;
        let profile = &mut ctx.accounts.creator_profile;
        profile.tier = tier;
        profile.trust_score = trust_score;
        profile.restricted = restricted;
        profile.manual_review_required = manual_review_required;
        emit!(CreatorTierUpdated { creator: profile.creator_wallet, tier, trust_score, restricted, manual_review_required });
        Ok(())
    }

    pub fn initialize_wallet_risk(ctx: Context<InitializeWalletRisk>) -> Result<()> {
        let risk = &mut ctx.accounts.risk_profile;
        risk.wallet = ctx.accounts.wallet.key();
        risk.risk_level = RISK_LOW;
        risk.restricted = false;
        risk.cluster_id = [0; 32];
        risk.cluster_wallet_count = 0;
        risk.bump = ctx.bumps.risk_profile;
        emit!(WalletRiskInitialized { wallet: risk.wallet });
        Ok(())
    }

    pub fn set_wallet_risk(ctx: Context<SetWalletRisk>, risk_level: u8, restricted: bool, cluster_id: [u8; 32], cluster_wallet_count: u16) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(ctx.accounts.authority.key() == config.admin || ctx.accounts.authority.key() == config.risk_admin, LaunchpadError::Unauthorized);
        require_valid_risk(risk_level)?;
        let risk = &mut ctx.accounts.risk_profile;
        risk.risk_level = risk_level;
        risk.restricted = restricted;
        risk.cluster_id = cluster_id;
        risk.cluster_wallet_count = cluster_wallet_count;
        emit!(WalletRiskUpdated { wallet: risk.wallet, risk_level, restricted, cluster_wallet_count });
        Ok(())
    }

    pub fn initialize_cluster_profile(ctx: Context<InitializeClusterProfile>, cluster_id: [u8; 32]) -> Result<()> {
        let cluster = &mut ctx.accounts.cluster_profile;
        cluster.cluster_id = cluster_id;
        cluster.wallet_count = 0;
        cluster.risk_level = RISK_LOW;
        cluster.restricted = false;
        cluster.bump = ctx.bumps.cluster_profile;
        emit!(ClusterProfileInitialized { cluster_id });
        Ok(())
    }

    pub fn set_cluster_risk(ctx: Context<SetClusterRisk>, wallet_count: u16, risk_level: u8, restricted: bool) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(ctx.accounts.authority.key() == config.admin || ctx.accounts.authority.key() == config.risk_admin, LaunchpadError::Unauthorized);
        require_valid_risk(risk_level)?;
        let cluster = &mut ctx.accounts.cluster_profile;
        cluster.wallet_count = wallet_count;
        cluster.risk_level = risk_level;
        cluster.restricted = restricted;
        emit!(ClusterRiskUpdated { cluster_id: cluster.cluster_id, wallet_count, risk_level, restricted });
        Ok(())
    }

    pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.global_paused, LaunchpadError::GlobalPaused);
        require!(!config.create_paused, LaunchpadError::CreatePaused);
        require!(args.graduation_target_lamports > 0, LaunchpadError::InvalidAmount);
        require!(args.creator_buy_cap_lamports > 0, LaunchpadError::InvalidAmount);
        require!(args.base_price_lamports > 0, LaunchpadError::InvalidAmount);

        let campaign_key = ctx.accounts.campaign_state.key();
        require!(ctx.accounts.mint.mint_authority == COption::Some(campaign_key), LaunchpadError::InvalidMintAuthority);
        require!(ctx.accounts.mint.freeze_authority == COption::None, LaunchpadError::InvalidMintAuthority);

        let now = Clock::get()?.unix_timestamp;
        let creator = &mut ctx.accounts.creator_profile;
        require_keys_eq!(creator.creator_wallet, ctx.accounts.creator.key(), LaunchpadError::InvalidCreatorProfile);
        require!(!creator.restricted, LaunchpadError::CreatorRestricted);
        require!(!creator.manual_review_required, LaunchpadError::CreatorManualReview);

        let rules = rules_for_tier(creator.tier)?;
        require!(creator.live_bonding_count < rules.max_live_bonding, LaunchpadError::CreatorLiveLimit);
        if creator.last_launch_timestamp > 0 {
            require!(now >= creator.last_launch_timestamp + rules.cooldown_seconds, LaunchpadError::CreatorCooldown);
        }

        if ctx.accounts.risk_profile.wallet == ctx.accounts.creator.key() {
            require!(!ctx.accounts.risk_profile.restricted, LaunchpadError::WalletRestricted);
            require!(ctx.accounts.risk_profile.cluster_wallet_count <= rules.max_cluster_wallets, LaunchpadError::ClusterLimit);
        }
        if ctx.accounts.cluster_profile.cluster_id != [0; 32] {
            require!(!ctx.accounts.cluster_profile.restricted, LaunchpadError::ClusterRestricted);
            require!(ctx.accounts.cluster_profile.wallet_count <= rules.max_cluster_wallets, LaunchpadError::ClusterLimit);
        }

        let campaign = &mut ctx.accounts.campaign_state;
        campaign.creator = ctx.accounts.creator.key();
        campaign.mint = ctx.accounts.mint.key();
        campaign.fee_vault = ctx.accounts.fee_vault.key();
        campaign.launch_timestamp = now;
        campaign.creator_buy_lock_until = now + rules.creator_buy_lock_seconds;
        campaign.creator_buy_cap_lamports = args.creator_buy_cap_lamports;
        campaign.creator_bought_lamports = 0;
        campaign.sold_amount = 0;
        campaign.gross_buy_lamports = 0;
        campaign.gross_sell_lamports = 0;
        campaign.graduation_target_lamports = args.graduation_target_lamports;
        campaign.base_price_lamports = args.base_price_lamports;
        campaign.price_slope_lamports = args.price_slope_lamports;
        campaign.graduated = false;
        campaign.paused = false;
        campaign.buy_paused = false;
        campaign.sell_paused = false;
        campaign.graduation_paused = false;
        campaign.bump = ctx.bumps.campaign_state;

        let vault = &mut ctx.accounts.fee_vault;
        vault.campaign_state = campaign_key;
        vault.mint = ctx.accounts.mint.key();
        vault.sol_vault_lamports = 0;
        vault.protocol_fee_lamports = 0;
        vault.creator_fee_lamports = 0;
        vault.recruiter_fee_lamports = 0;
        vault.squad_fee_lamports = 0;
        vault.bump = ctx.bumps.fee_vault;

        creator.live_bonding_count = creator.live_bonding_count.checked_add(1).ok_or(LaunchpadError::MathOverflow)?;
        creator.total_launches = creator.total_launches.checked_add(1).ok_or(LaunchpadError::MathOverflow)?;
        creator.last_launch_timestamp = now;
        emit!(CampaignCreated { creator: campaign.creator, mint: campaign.mint, campaign: campaign.key(), fee_vault: campaign.fee_vault });
        Ok(())
    }

    pub fn pause_campaign(ctx: Context<PauseCampaign>, paused: bool, buy_paused: bool, sell_paused: bool, graduation_paused: bool) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(ctx.accounts.authority.key() == config.admin || ctx.accounts.authority.key() == config.pauser, LaunchpadError::Unauthorized);
        let campaign = &mut ctx.accounts.campaign_state;
        campaign.paused = paused;
        campaign.buy_paused = buy_paused;
        campaign.sell_paused = sell_paused;
        campaign.graduation_paused = graduation_paused;
        emit!(CampaignPauseUpdated { campaign: campaign.key(), paused, buy_paused, sell_paused, graduation_paused });
        Ok(())
    }

    pub fn buy(ctx: Context<Trade>, lamports_in: u64) -> Result<()> {
        let config = &ctx.accounts.global_config;
        let campaign_key = ctx.accounts.campaign_state.key();
        let campaign = &mut ctx.accounts.campaign_state;
        require_trade_accounts(campaign, &ctx.accounts.fee_vault, campaign_key)?;
        require!(!config.global_paused, LaunchpadError::GlobalPaused);
        require!(!campaign.paused, LaunchpadError::CampaignPaused);
        require!(!campaign.buy_paused, LaunchpadError::BuysPaused);
        require!(!campaign.graduated, LaunchpadError::AlreadyGraduated);
        require!(lamports_in > 0, LaunchpadError::InvalidAmount);
        require!(!ctx.accounts.risk_profile.restricted, LaunchpadError::WalletRestricted);

        let buyer = ctx.accounts.trader.key();
        if buyer == campaign.creator {
            let now = Clock::get()?.unix_timestamp;
            require!(now >= campaign.creator_buy_lock_until, LaunchpadError::CreatorBuyLocked);
            let next_creator_bought = campaign.creator_bought_lamports.checked_add(lamports_in).ok_or(LaunchpadError::MathOverflow)?;
            require!(next_creator_bought <= campaign.creator_buy_cap_lamports, LaunchpadError::CreatorBuyCap);
            campaign.creator_bought_lamports = next_creator_bought;
        }

        let protocol_fee = calculate_fee(lamports_in, config.trade_fee_bps)?;
        let net_curve_lamports = lamports_in.checked_sub(protocol_fee).ok_or(LaunchpadError::MathOverflow)?;
        let tokens_out = quote_buy_tokens(campaign, net_curve_lamports)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.trader.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                },
            ),
            lamports_in,
        )?;

        let signer_seeds: &[&[u8]] = &[b"campaign", campaign.mint.as_ref(), &[campaign.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.campaign_state.to_account_info(),
                },
                &[signer_seeds],
            ),
            tokens_out,
        )?;

        let vault = &mut ctx.accounts.fee_vault;
        vault.protocol_fee_lamports = vault.protocol_fee_lamports.checked_add(protocol_fee).ok_or(LaunchpadError::MathOverflow)?;
        vault.sol_vault_lamports = vault.sol_vault_lamports.checked_add(net_curve_lamports).ok_or(LaunchpadError::MathOverflow)?;
        campaign.gross_buy_lamports = campaign.gross_buy_lamports.checked_add(lamports_in).ok_or(LaunchpadError::MathOverflow)?;
        campaign.sold_amount = campaign.sold_amount.checked_add(tokens_out).ok_or(LaunchpadError::MathOverflow)?;
        emit!(Bought { campaign: campaign.key(), buyer, lamports_in, protocol_fee_lamports: protocol_fee, tokens_out });
        Ok(())
    }

    pub fn sell(ctx: Context<Trade>, token_amount: u64) -> Result<()> {
        let config = &ctx.accounts.global_config;
        let campaign_key = ctx.accounts.campaign_state.key();
        let campaign = &mut ctx.accounts.campaign_state;
        require_trade_accounts(campaign, &ctx.accounts.fee_vault, campaign_key)?;
        require!(!config.global_paused, LaunchpadError::GlobalPaused);
        require!(!campaign.paused, LaunchpadError::CampaignPaused);
        require!(!campaign.sell_paused, LaunchpadError::SellsPaused);
        require!(!campaign.graduated, LaunchpadError::AlreadyGraduated);
        require!(token_amount > 0, LaunchpadError::InvalidAmount);
        require!(!ctx.accounts.risk_profile.restricted, LaunchpadError::WalletRestricted);
        require!(campaign.sold_amount >= token_amount, LaunchpadError::InsufficientSoldAmount);

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.trader_token_account.to_account_info(),
                    authority: ctx.accounts.trader.to_account_info(),
                },
            ),
            token_amount,
        )?;

        let gross_refund = quote_sell_refund(campaign, token_amount)?;
        let protocol_fee = calculate_fee(gross_refund, config.trade_fee_bps)?;
        let refund_to_trader = gross_refund.checked_sub(protocol_fee).ok_or(LaunchpadError::MathOverflow)?;
        require!(ctx.accounts.fee_vault.sol_vault_lamports >= gross_refund, LaunchpadError::InsufficientVaultBalance);

        {
            let vault_info = ctx.accounts.fee_vault.to_account_info();
            let trader_info = ctx.accounts.trader.to_account_info();
            **vault_info.try_borrow_mut_lamports()? = vault_info
                .lamports()
                .checked_sub(refund_to_trader)
                .ok_or(LaunchpadError::MathOverflow)?;
            **trader_info.try_borrow_mut_lamports()? = trader_info
                .lamports()
                .checked_add(refund_to_trader)
                .ok_or(LaunchpadError::MathOverflow)?;
        }

        let vault = &mut ctx.accounts.fee_vault;
        vault.protocol_fee_lamports = vault.protocol_fee_lamports.checked_add(protocol_fee).ok_or(LaunchpadError::MathOverflow)?;
        vault.sol_vault_lamports = vault.sol_vault_lamports.checked_sub(gross_refund).ok_or(LaunchpadError::MathOverflow)?;
        campaign.sold_amount = campaign.sold_amount.checked_sub(token_amount).ok_or(LaunchpadError::MathOverflow)?;
        campaign.gross_sell_lamports = campaign.gross_sell_lamports.checked_add(gross_refund).ok_or(LaunchpadError::MathOverflow)?;
        emit!(Sold { campaign: campaign.key(), seller: ctx.accounts.trader.key(), token_amount, gross_refund_lamports: gross_refund, protocol_fee_lamports: protocol_fee });
        Ok(())
    }

    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        let campaign = &mut ctx.accounts.campaign_state;
        require!(!config.global_paused, LaunchpadError::GlobalPaused);
        require!(!campaign.paused, LaunchpadError::CampaignPaused);
        require!(!campaign.graduation_paused, LaunchpadError::GraduationPaused);
        require!(!campaign.graduated, LaunchpadError::AlreadyGraduated);
        require!(campaign.sold_amount >= campaign.graduation_target_lamports, LaunchpadError::GraduationThreshold);
        campaign.graduated = true;
        let creator = &mut ctx.accounts.creator_profile;
        if creator.live_bonding_count > 0 {
            creator.live_bonding_count -= 1;
        }
        creator.successful_graduations = creator.successful_graduations.checked_add(1).ok_or(LaunchpadError::MathOverflow)?;
        emit!(Graduated { campaign: campaign.key(), creator: campaign.creator, mint: campaign.mint });
        Ok(())
    }

    pub fn claim_creator_rewards(_ctx: Context<ClaimRewards>) -> Result<()> { Ok(()) }
    pub fn claim_recruiter_rewards(_ctx: Context<ClaimRewards>) -> Result<()> { Ok(()) }
    pub fn claim_squad_rewards(_ctx: Context<ClaimRewards>) -> Result<()> { Ok(()) }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGlobalConfigArgs {
    pub pauser: Pubkey,
    pub risk_admin: Pubkey,
    pub tier_admin: Pubkey,
    pub fee_authority: Pubkey,
    pub trade_fee_bps: u16,
    pub graduation_fee_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateCampaignArgs {
    pub graduation_target_lamports: u64,
    pub creator_buy_cap_lamports: u64,
    pub base_price_lamports: u64,
    pub price_slope_lamports: u64,
}

#[derive(Clone, Copy)]
pub struct TierRules {
    pub max_live_bonding: u16,
    pub cooldown_seconds: i64,
    pub creator_buy_lock_seconds: i64,
    pub max_cluster_wallets: u16,
}

pub fn rules_for_tier(tier: u8) -> Result<TierRules> {
    match tier {
        TIER_NEW => Ok(TierRules { max_live_bonding: 3, cooldown_seconds: 24 * 60 * 60, creator_buy_lock_seconds: 24 * 60 * 60, max_cluster_wallets: 3 }),
        TIER_TRUSTED => Ok(TierRules { max_live_bonding: 5, cooldown_seconds: 24 * 60 * 60, creator_buy_lock_seconds: 6 * 60 * 60, max_cluster_wallets: 5 }),
        TIER_PROVEN => Ok(TierRules { max_live_bonding: 10, cooldown_seconds: 24 * 60 * 60, creator_buy_lock_seconds: 60 * 60, max_cluster_wallets: 10 }),
        _ => err!(LaunchpadError::InvalidTier),
    }
}

pub fn require_valid_tier(tier: u8) -> Result<()> {
    rules_for_tier(tier).map(|_| ())
}

pub fn require_valid_risk(risk_level: u8) -> Result<()> {
    require!(risk_level <= RISK_HIGH, LaunchpadError::InvalidRiskLevel);
    Ok(())
}

pub fn require_bps(bps: u16) -> Result<()> {
    require!(u64::from(bps) <= BPS_DENOMINATOR, LaunchpadError::InvalidBps);
    Ok(())
}

pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    amount
        .checked_mul(u64::from(fee_bps))
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(LaunchpadError::MathOverflow)
}

pub fn quote_buy_tokens(campaign: &CampaignState, net_lamports: u64) -> Result<u64> {
    let price = campaign
        .base_price_lamports
        .checked_add(campaign.sold_amount.checked_mul(campaign.price_slope_lamports).ok_or(LaunchpadError::MathOverflow)?)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(price > 0, LaunchpadError::InvalidAmount);
    let tokens = net_lamports.checked_div(price).ok_or(LaunchpadError::MathOverflow)?;
    require!(tokens > 0, LaunchpadError::InvalidAmount);
    Ok(tokens)
}

pub fn quote_sell_refund(campaign: &CampaignState, token_amount: u64) -> Result<u64> {
    let post_sell_supply = campaign.sold_amount.checked_sub(token_amount).ok_or(LaunchpadError::MathOverflow)?;
    let price = campaign
        .base_price_lamports
        .checked_add(post_sell_supply.checked_mul(campaign.price_slope_lamports).ok_or(LaunchpadError::MathOverflow)?)
        .ok_or(LaunchpadError::MathOverflow)?;
    token_amount.checked_mul(price).ok_or(LaunchpadError::MathOverflow)
}

pub fn require_trade_accounts(campaign: &CampaignState, fee_vault: &FeeVault, campaign_key: Pubkey) -> Result<()> {
    require_keys_eq!(campaign.fee_vault, fee_vault.key(), LaunchpadError::InvalidFeeVault);
    require_keys_eq!(campaign.mint, fee_vault.mint, LaunchpadError::InvalidFeeVault);
    require_keys_eq!(campaign_key, fee_vault.campaign_state, LaunchpadError::InvalidFeeVault);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(init, payer = admin, space = 8 + GlobalConfig::SPACE, seeds = [b"global"], bump)]
    pub global_config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetGlobalPause<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
}

#[derive(Accounts)]
pub struct InitializeCreatorProfile<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(init, payer = creator, space = 8 + CreatorProfile::SPACE, seeds = [b"creator", creator.key().as_ref()], bump)]
    pub creator_profile: Account<'info, CreatorProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetCreatorTier<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"creator", creator_profile.creator_wallet.as_ref()], bump = creator_profile.bump)]
    pub creator_profile: Account<'info, CreatorProfile>,
}

#[derive(Accounts)]
pub struct InitializeWalletRisk<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: The wallet being risk-profiled does not need to sign for admin-created profiles.
    pub wallet: UncheckedAccount<'info>,
    #[account(init, payer = payer, space = 8 + RiskProfile::SPACE, seeds = [b"risk", wallet.key().as_ref()], bump)]
    pub risk_profile: Account<'info, RiskProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetWalletRisk<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"risk", risk_profile.wallet.as_ref()], bump = risk_profile.bump)]
    pub risk_profile: Account<'info, RiskProfile>,
}

#[derive(Accounts)]
#[instruction(cluster_id: [u8; 32])]
pub struct InitializeClusterProfile<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + ClusterProfile::SPACE, seeds = [b"cluster", cluster_id.as_ref()], bump)]
    pub cluster_profile: Account<'info, ClusterProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetClusterRisk<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"cluster", cluster_profile.cluster_id.as_ref()], bump = cluster_profile.bump)]
    pub cluster_profile: Account<'info, ClusterProfile>,
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [b"creator", creator.key().as_ref()], bump = creator_profile.bump)]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(seeds = [b"risk", creator.key().as_ref()], bump = risk_profile.bump)]
    pub risk_profile: Account<'info, RiskProfile>,
    pub cluster_profile: Account<'info, ClusterProfile>,
    #[account(mut)]
    pub mint: Account<'info, Mint>,
    #[account(init, payer = creator, space = 8 + CampaignState::SPACE, seeds = [b"campaign", mint.key().as_ref()], bump)]
    pub campaign_state: Account<'info, CampaignState>,
    #[account(init, payer = creator, space = 8 + FeeVault::SPACE, seeds = [b"fee_vault", mint.key().as_ref()], bump)]
    pub fee_vault: Account<'info, FeeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PauseCampaign<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub campaign_state: Account<'info, CampaignState>,
}

#[derive(Accounts)]
pub struct Trade<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub campaign_state: Account<'info, CampaignState>,
    #[account(mut, address = campaign_state.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"fee_vault", campaign_state.mint.as_ref()], bump = fee_vault.bump)]
    pub fee_vault: Account<'info, FeeVault>,
    #[account(mut, token::mint = mint, token::authority = trader)]
    pub trader_token_account: Account<'info, TokenAccount>,
    #[account(seeds = [b"risk", trader.key().as_ref()], bump = risk_profile.bump)]
    pub risk_profile: Account<'info, RiskProfile>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Graduate<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"global"], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(mut)]
    pub campaign_state: Account<'info, CampaignState>,
    #[account(mut, seeds = [b"creator", campaign_state.creator.as_ref()], bump = creator_profile.bump)]
    pub creator_profile: Account<'info, CreatorProfile>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    pub claimant: Signer<'info>,
}

#[account]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub pauser: Pubkey,
    pub risk_admin: Pubkey,
    pub tier_admin: Pubkey,
    pub fee_authority: Pubkey,
    pub global_paused: bool,
    pub create_paused: bool,
    pub trade_fee_bps: u16,
    pub graduation_fee_bps: u16,
    pub bump: u8,
}
impl GlobalConfig { pub const SPACE: usize = 32 * 5 + 1 + 1 + 2 + 2 + 1; }

#[account]
pub struct CreatorProfile {
    pub creator_wallet: Pubkey,
    pub tier: u8,
    pub trust_score: u64,
    pub live_bonding_count: u16,
    pub last_launch_timestamp: i64,
    pub total_launches: u64,
    pub successful_graduations: u64,
    pub restricted: bool,
    pub manual_review_required: bool,
    pub bump: u8,
}
impl CreatorProfile { pub const SPACE: usize = 32 + 1 + 8 + 2 + 8 + 8 + 8 + 1 + 1 + 1; }

#[account]
pub struct CampaignState {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub fee_vault: Pubkey,
    pub launch_timestamp: i64,
    pub creator_buy_lock_until: i64,
    pub creator_buy_cap_lamports: u64,
    pub creator_bought_lamports: u64,
    pub sold_amount: u64,
    pub gross_buy_lamports: u64,
    pub gross_sell_lamports: u64,
    pub graduation_target_lamports: u64,
    pub base_price_lamports: u64,
    pub price_slope_lamports: u64,
    pub graduated: bool,
    pub paused: bool,
    pub buy_paused: bool,
    pub sell_paused: bool,
    pub graduation_paused: bool,
    pub bump: u8,
}
impl CampaignState { pub const SPACE: usize = 32 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 1 + 1 + 1 + 1; }

#[account]
pub struct FeeVault {
    pub campaign_state: Pubkey,
    pub mint: Pubkey,
    pub sol_vault_lamports: u64,
    pub protocol_fee_lamports: u64,
    pub creator_fee_lamports: u64,
    pub recruiter_fee_lamports: u64,
    pub squad_fee_lamports: u64,
    pub bump: u8,
}
impl FeeVault { pub const SPACE: usize = 32 + 32 + 8 + 8 + 8 + 8 + 8 + 1; }

#[account]
pub struct RiskProfile {
    pub wallet: Pubkey,
    pub risk_level: u8,
    pub restricted: bool,
    pub cluster_id: [u8; 32],
    pub cluster_wallet_count: u16,
    pub bump: u8,
}
impl RiskProfile { pub const SPACE: usize = 32 + 1 + 1 + 32 + 2 + 1; }

#[account]
pub struct ClusterProfile {
    pub cluster_id: [u8; 32],
    pub wallet_count: u16,
    pub risk_level: u8,
    pub restricted: bool,
    pub bump: u8,
}
impl ClusterProfile { pub const SPACE: usize = 32 + 2 + 1 + 1 + 1; }

#[event]
pub struct GlobalConfigInitialized { pub admin: Pubkey }
#[event]
pub struct GlobalPauseUpdated { pub global_paused: bool, pub create_paused: bool }
#[event]
pub struct CreatorProfileInitialized { pub creator: Pubkey }
#[event]
pub struct CreatorTierUpdated { pub creator: Pubkey, pub tier: u8, pub trust_score: u64, pub restricted: bool, pub manual_review_required: bool }
#[event]
pub struct WalletRiskInitialized { pub wallet: Pubkey }
#[event]
pub struct WalletRiskUpdated { pub wallet: Pubkey, pub risk_level: u8, pub restricted: bool, pub cluster_wallet_count: u16 }
#[event]
pub struct ClusterProfileInitialized { pub cluster_id: [u8; 32] }
#[event]
pub struct ClusterRiskUpdated { pub cluster_id: [u8; 32], pub wallet_count: u16, pub risk_level: u8, pub restricted: bool }
#[event]
pub struct CampaignCreated { pub creator: Pubkey, pub mint: Pubkey, pub campaign: Pubkey, pub fee_vault: Pubkey }
#[event]
pub struct CampaignPauseUpdated { pub campaign: Pubkey, pub paused: bool, pub buy_paused: bool, pub sell_paused: bool, pub graduation_paused: bool }
#[event]
pub struct Bought { pub campaign: Pubkey, pub buyer: Pubkey, pub lamports_in: u64, pub protocol_fee_lamports: u64, pub tokens_out: u64 }
#[event]
pub struct Sold { pub campaign: Pubkey, pub seller: Pubkey, pub token_amount: u64, pub gross_refund_lamports: u64, pub protocol_fee_lamports: u64 }
#[event]
pub struct Graduated { pub campaign: Pubkey, pub creator: Pubkey, pub mint: Pubkey }

#[error_code]
pub enum LaunchpadError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid creator tier")]
    InvalidTier,
    #[msg("Invalid risk level")]
    InvalidRiskLevel,
    #[msg("Invalid basis points")]
    InvalidBps,
    #[msg("Global launchpad is paused")]
    GlobalPaused,
    #[msg("Campaign creation is paused")]
    CreatePaused,
    #[msg("Campaign is paused")]
    CampaignPaused,
    #[msg("Buys are paused")]
    BuysPaused,
    #[msg("Sells are paused")]
    SellsPaused,
    #[msg("Graduation is paused")]
    GraduationPaused,
    #[msg("Creator is restricted")]
    CreatorRestricted,
    #[msg("Creator requires manual review")]
    CreatorManualReview,
    #[msg("Creator launch cooldown is active")]
    CreatorCooldown,
    #[msg("Creator live bonding limit reached")]
    CreatorLiveLimit,
    #[msg("Creator profile does not match signer")]
    InvalidCreatorProfile,
    #[msg("Wallet is restricted")]
    WalletRestricted,
    #[msg("Cluster is restricted")]
    ClusterRestricted,
    #[msg("Cluster wallet limit exceeded")]
    ClusterLimit,
    #[msg("Creator buy lock is active")]
    CreatorBuyLocked,
    #[msg("Creator buy cap exceeded")]
    CreatorBuyCap,
    #[msg("Invalid mint authority")]
    InvalidMintAuthority,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Campaign already graduated")]
    AlreadyGraduated,
    #[msg("Graduation threshold not reached")]
    GraduationThreshold,
    #[msg("Insufficient sold amount")]
    InsufficientSoldAmount,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Invalid fee vault")]
    InvalidFeeVault,
    #[msg("Math overflow or underflow")]
    MathOverflow,
}