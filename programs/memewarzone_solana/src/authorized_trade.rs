//! V4 bonding buy/sell (P1).
//!
//! Buy: exact SOL in → max tokens out (binary search on linear curve).
//! Sell: exact tokens in → SOL out (reverse linear cost).
//! Tokens move vault ↔ trader ATA (mint authority already revoked at create).
//! SOL moves trader ↔ campaign sol_vault PDA.
//! Detached Ed25519 route auth mirrors create when `authorized_trading_required`.

use anchor_lang::{
    prelude::*,
    solana_program::{
        ed25519_program,
        hash::hash,
        program::{invoke, invoke_signed},
        system_instruction,
        sysvar::instructions::{
            load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_SYSVAR_ID,
        },
    },
};
use anchor_spl::token::{self, Transfer};

use crate::{
    authorized_create::{
        Campaign, CampaignSolVault, CAMPAIGN_SEED, SOL_VAULT_SEED, TOKEN_VAULT_SEED,
    },
    GlobalConfig, LaunchpadError, RiskProfile, BPS_DENOMINATOR, CURVE_KIND_LINEAR_V1,
    ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, GLOBAL_CONFIG_SEED, RISK_PROFILE_SEED,
};

pub const TRADE_AUTH_DOMAIN: &[u8] = b"MEMEWARZONE_SOLANA_TRADE_V1";
pub const TRADE_AUTH_SCHEMA_VERSION: u16 = 1;
pub const TRADE_AUTH_SEED: &[u8] = b"trade-auth";
pub const TRADE_SIDE_BUY: u8 = 1;
pub const TRADE_SIDE_SELL: u8 = 2;

const ED25519_HEADER_SIZE: usize = 16;
const ED25519_SIGNATURE_SIZE: usize = 64;
const ED25519_PUBLIC_KEY_SIZE: usize = 32;
const ED25519_CURRENT_INSTRUCTION: u16 = u16::MAX;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct BuyTokensArgs {
    /// Gross SOL the trader pays (includes fee).
    pub lamports_in: u64,
    /// Minimum tokens out after fee-aware quote (slippage).
    pub min_tokens_out: u64,
    pub deadline: i64,
    pub nonce: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct SellTokensArgs {
    /// Exact tokens the trader sells.
    pub tokens_in: u64,
    /// Minimum SOL returned after fee (slippage).
    pub min_lamports_out: u64,
    pub deadline: i64,
    pub nonce: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct TradeAuthorization {
    pub trader: Pubkey,
    pub campaign: Pubkey,
    pub side: u8,
    pub nonce: [u8; 32],
    pub deadline: i64,
    pub used_at: i64,
    pub route_signer: Pubkey,
    pub message_hash: [u8; 32],
    pub schema_version: u16,
    pub bump: u8,
}

#[event]
pub struct TokensBought {
    pub campaign: Pubkey,
    pub trader: Pubkey,
    pub lamports_in: u64,
    pub fee_lamports: u64,
    pub net_lamports: u64,
    pub tokens_out: u64,
    pub sold_tokens_after: u64,
    pub net_raised_after: u64,
}

#[event]
pub struct TokensSold {
    pub campaign: Pubkey,
    pub trader: Pubkey,
    pub tokens_in: u64,
    pub gross_lamports: u64,
    pub fee_lamports: u64,
    pub lamports_out: u64,
    pub sold_tokens_after: u64,
    pub net_raised_after: u64,
}

// ── Curve math ──────────────────────────────────────────────────────────────
//
// economics_version V1 (legacy): cost = n*base + slope*(sold*n + n*(n-1)/2)
//   base is lamports **per raw token unit** (made early buys tiny for 6-dec mints).
//
// economics_version V2 (BNB parity): LaunchCampaign-style area scaling
//   area(x) = x*base/scale + slope*x^2/(2*scale^2), scale = 10^decimals
//   base/slope are priced **per whole token** (same intent as BNB basePrice=1e9, WAD=1e18).
//   With base=1, decimals=6, 0.01 SOL buys ~10M tokens — meme bonding like BNB/competitors.

pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    let fee = u128::from(amount)
        .checked_mul(u128::from(fee_bps))
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(u128::from(BPS_DENOMINATOR))
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(fee <= u128::from(u64::MAX), LaunchpadError::MathOverflow);
    Ok(fee as u64)
}

fn token_scale(decimals: u8) -> Result<u128> {
    require!(decimals <= 18, LaunchpadError::InvalidGenerationEconomics);
    10u128
        .checked_pow(u32::from(decimals))
        .ok_or_else(|| error!(LaunchpadError::MathOverflow))
}

/// Legacy V1 cost (per raw unit).
pub fn checked_linear_curve_cost_v1(
    base_price_lamports: u64,
    price_slope_lamports: u64,
    start_supply: u64,
    token_amount: u64,
) -> Result<u64> {
    if token_amount == 0 {
        return Ok(0);
    }
    let token_count = u128::from(token_amount);
    let base_cost = token_count
        .checked_mul(u128::from(base_price_lamports))
        .ok_or(LaunchpadError::MathOverflow)?;
    let supply_cost = token_count
        .checked_mul(u128::from(start_supply))
        .ok_or(LaunchpadError::MathOverflow)?;
    let step_sum = token_count
        .checked_mul(
            token_count
                .checked_sub(1)
                .ok_or(LaunchpadError::MathOverflow)?,
        )
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(2)
        .ok_or(LaunchpadError::MathOverflow)?;
    let slope_units = supply_cost
        .checked_add(step_sum)
        .ok_or(LaunchpadError::MathOverflow)?;
    let slope_cost = slope_units
        .checked_mul(u128::from(price_slope_lamports))
        .ok_or(LaunchpadError::MathOverflow)?;
    let total = base_cost
        .checked_add(slope_cost)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(total <= u128::from(u64::MAX), LaunchpadError::MathOverflow);
    Ok(total as u64)
}

/// BNB-parity V2 cost: base/slope per whole token, amounts in raw units.
pub fn checked_linear_curve_cost_v2(
    base_price_lamports: u64,
    price_slope_lamports: u64,
    start_supply: u64,
    token_amount: u64,
    token_decimals: u8,
) -> Result<u64> {
    if token_amount == 0 {
        return Ok(0);
    }
    let scale = token_scale(token_decimals)?;
    let a = u128::from(token_amount);
    let s = u128::from(start_supply);
    let base = u128::from(base_price_lamports);
    let slope = u128::from(price_slope_lamports);

    // linear = a * base / scale  (BNB: x * basePrice / WAD)
    let linear = a
        .checked_mul(base)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(scale)
        .ok_or(LaunchpadError::MathOverflow)?;

    // slope_term = slope * (2*s*a + a*a) / (2 * scale^2)  (BNB area difference)
    let two_sa = s
        .checked_mul(a)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_mul(2)
        .ok_or(LaunchpadError::MathOverflow)?;
    let a2 = a.checked_mul(a).ok_or(LaunchpadError::MathOverflow)?;
    let numer = two_sa.checked_add(a2).ok_or(LaunchpadError::MathOverflow)?;
    let scale2 = scale.checked_mul(scale).ok_or(LaunchpadError::MathOverflow)?;
    let denom = scale2.checked_mul(2).ok_or(LaunchpadError::MathOverflow)?;
    let slope_term = slope
        .checked_mul(numer)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(denom)
        .ok_or(LaunchpadError::MathOverflow)?;

    let total = linear
        .checked_add(slope_term)
        .ok_or(LaunchpadError::MathOverflow)?;
    require!(total <= u128::from(u64::MAX), LaunchpadError::MathOverflow);
    Ok(total as u64)
}

pub fn checked_linear_curve_cost(
    economics_version: u16,
    base_price_lamports: u64,
    price_slope_lamports: u64,
    start_supply: u64,
    token_amount: u64,
    token_decimals: u8,
) -> Result<u64> {
    if economics_version >= ECONOMICS_VERSION_V2 {
        checked_linear_curve_cost_v2(
            base_price_lamports,
            price_slope_lamports,
            start_supply,
            token_amount,
            token_decimals,
        )
    } else {
        checked_linear_curve_cost_v1(
            base_price_lamports,
            price_slope_lamports,
            start_supply,
            token_amount,
        )
    }
}

/// Max tokens purchasable with `net_lamports` (exact SOL-in quote).
pub fn quote_buy_tokens(
    economics_version: u16,
    base_price_lamports: u64,
    price_slope_lamports: u64,
    sold_tokens: u64,
    curve_token_supply: u64,
    net_lamports: u64,
    token_decimals: u8,
) -> Result<u64> {
    require!(net_lamports > 0, LaunchpadError::InvalidTradeAmount);
    require!(base_price_lamports > 0, LaunchpadError::InvalidTradeAmount);
    require!(
        sold_tokens < curve_token_supply,
        LaunchpadError::CurveSupplyExhausted
    );

    let remaining = curve_token_supply
        .checked_sub(sold_tokens)
        .ok_or(LaunchpadError::MathOverflow)?;

    // Upper bound for binary search.
    let max_by_base = if economics_version >= ECONOMICS_VERSION_V2 {
        let scale = token_scale(token_decimals)?;
        // n * base / scale <= net  →  n <= net * scale / base
        let n = u128::from(net_lamports)
            .checked_mul(scale)
            .ok_or(LaunchpadError::MathOverflow)?
            .checked_div(u128::from(base_price_lamports))
            .ok_or(LaunchpadError::MathOverflow)?;
        u64::try_from(n.min(u128::from(u64::MAX))).unwrap_or(u64::MAX)
    } else {
        net_lamports
            .checked_div(base_price_lamports)
            .ok_or(LaunchpadError::MathOverflow)?
    };
    require!(max_by_base > 0, LaunchpadError::InvalidTradeAmount);
    let mut high = max_by_base.min(remaining);
    let mut low = 0u64;

    while low < high {
        let mid = low
            .checked_add(
                high.checked_sub(low)
                    .ok_or(LaunchpadError::MathOverflow)?
                    .checked_add(1)
                    .ok_or(LaunchpadError::MathOverflow)?
                    .checked_div(2)
                    .ok_or(LaunchpadError::MathOverflow)?,
            )
            .ok_or(LaunchpadError::MathOverflow)?;
        match checked_linear_curve_cost(
            economics_version,
            base_price_lamports,
            price_slope_lamports,
            sold_tokens,
            mid,
            token_decimals,
        ) {
            Ok(cost) if cost <= net_lamports => low = mid,
            _ => {
                high = mid.checked_sub(1).ok_or(LaunchpadError::MathOverflow)?;
            }
        }
    }
    require!(low > 0, LaunchpadError::InvalidTradeAmount);
    Ok(low)
}

/// Gross SOL refund for selling `token_amount` (exact tokens-in quote, pre-fee).
pub fn quote_sell_refund(
    economics_version: u16,
    base_price_lamports: u64,
    price_slope_lamports: u64,
    sold_tokens: u64,
    token_amount: u64,
    token_decimals: u8,
) -> Result<u64> {
    require!(token_amount > 0, LaunchpadError::InvalidTradeAmount);
    require!(
        sold_tokens >= token_amount,
        LaunchpadError::InsufficientSoldTokens
    );
    let post_sell = sold_tokens
        .checked_sub(token_amount)
        .ok_or(LaunchpadError::MathOverflow)?;
    checked_linear_curve_cost(
        economics_version,
        base_price_lamports,
        price_slope_lamports,
        post_sell,
        token_amount,
        token_decimals,
    )
}

// ── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: BuyTokensArgs)]
pub struct BuyTokens<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    /// CHECK: campaign PDA; loaded and validated in handler.
    #[account(mut)]
    pub campaign: UncheckedAccount<'info>,
    /// CHECK: mint; validated against campaign.mint.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: token vault PDA holding curve tokens.
    #[account(mut)]
    pub token_vault: UncheckedAccount<'info>,
    /// CHECK: sol vault PDA.
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: trader ATA for mint.
    #[account(mut)]
    pub trader_token_account: UncheckedAccount<'info>,
    /// CHECK: risk profile for trader.
    #[account(seeds = [RISK_PROFILE_SEED, trader.key().as_ref()], bump)]
    pub risk_profile: UncheckedAccount<'info>,
    /// CHECK: trade-auth PDA (created when trading requires route auth).
    #[account(
        mut,
        seeds = [TRADE_AUTH_SEED, trader.key().as_ref(), args.nonce.as_ref()],
        bump
    )]
    pub trade_authorization: UncheckedAccount<'info>,
    /// CHECK: Instructions sysvar for Ed25519 verify.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: SPL Token program.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: System program.
    pub system_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(args: SellTokensArgs)]
pub struct SellTokens<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,
    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,
    /// CHECK: campaign PDA.
    #[account(mut)]
    pub campaign: UncheckedAccount<'info>,
    /// CHECK: mint.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: token vault.
    #[account(mut)]
    pub token_vault: UncheckedAccount<'info>,
    /// CHECK: sol vault.
    #[account(mut)]
    pub sol_vault: UncheckedAccount<'info>,
    /// CHECK: trader ATA.
    #[account(mut)]
    pub trader_token_account: UncheckedAccount<'info>,
    /// CHECK: risk profile.
    #[account(seeds = [RISK_PROFILE_SEED, trader.key().as_ref()], bump)]
    pub risk_profile: UncheckedAccount<'info>,
    /// CHECK: trade-auth PDA.
    #[account(
        mut,
        seeds = [TRADE_AUTH_SEED, trader.key().as_ref(), args.nonce.as_ref()],
        bump
    )]
    pub trade_authorization: UncheckedAccount<'info>,
    /// CHECK: Instructions sysvar.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions: UncheckedAccount<'info>,
    /// CHECK: Token program.
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: System program.
    pub system_program: UncheckedAccount<'info>,
}

// ── Handlers ────────────────────────────────────────────────────────────────

pub fn buy_tokens_handler(ctx: Context<BuyTokens>, args: BuyTokensArgs) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    require!(args.lamports_in > 0, LaunchpadError::InvalidTradeAmount);
    require!(args.deadline >= now, LaunchpadError::TradeAuthorizationExpired);
    require_keys_eq!(
        *ctx.accounts.token_program.key,
        token::ID,
        LaunchpadError::InvalidCampaign
    );

    let global = &ctx.accounts.global_config;
    require!(!global.paused, LaunchpadError::LaunchpadPaused);
    require!(!global.buy_paused, LaunchpadError::BuysPaused);

    let trader = ctx.accounts.trader.key();
    let campaign_key = ctx.accounts.campaign.key();
    let mint_key = ctx.accounts.mint.key();
    let token_vault_key = ctx.accounts.token_vault.key();
    let sol_vault_key = ctx.accounts.sol_vault.key();
    let route_signer = global.route_signer;
    let auth_required = global.authorized_trading_required;
    let trade_auth_bump = ctx.bumps.trade_authorization;

    // Phase 1: read-only validation + quote (drop borrows before CPI).
    let (
        campaign_id,
        campaign_bump,
        fee,
        net,
        tokens_out,
        was_zero_sold,
        creator_bought_update,
    ) = {
        let data = ctx.accounts.campaign.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        let campaign = Campaign::try_deserialize(&mut slice)?;
        validate_trade_accounts(
            &campaign,
            campaign_key,
            mint_key,
            token_vault_key,
            sol_vault_key,
        )?;
        require!(!campaign.graduated, LaunchpadError::AlreadyGraduated);
        require!(now >= campaign.launch_at, LaunchpadError::TradingNotOpen);
        require!(
            campaign.curve_kind == CURVE_KIND_LINEAR_V1,
            LaunchpadError::InvalidCampaign
        );

        {
            let risk_data = ctx.accounts.risk_profile.try_borrow_data()?;
            let mut risk_slice: &[u8] = &risk_data;
            let risk = RiskProfile::try_deserialize(&mut risk_slice)?;
            require_keys_eq!(risk.wallet, trader, LaunchpadError::InvalidRiskProfile);
            require!(!risk.restricted, LaunchpadError::WalletRestricted);
        }

        if auth_required {
            let digest = build_trade_authorization_digest(
                crate::id(),
                campaign_key,
                campaign.mint,
                trader,
                TRADE_SIDE_BUY,
                args.lamports_in,
                args.min_tokens_out,
                args.deadline,
                &args.nonce,
            );
            verify_detached_trade_authorization(
                &ctx.accounts.instructions.to_account_info(),
                route_signer,
                &digest,
            )?;
        }

        let fee = calculate_fee(args.lamports_in, campaign.buy_fee_bps)?;
        let net = args
            .lamports_in
            .checked_sub(fee)
            .ok_or(LaunchpadError::MathOverflow)?;
        require!(net > 0, LaunchpadError::InvalidTradeAmount);

        let tokens_out = quote_buy_tokens(
            campaign.economics_version,
            campaign.base_price_lamports,
            campaign.price_slope_lamports,
            campaign.sold_tokens,
            campaign.curve_token_supply,
            net,
            campaign.token_decimals,
        )?;
        require!(
            tokens_out >= args.min_tokens_out,
            LaunchpadError::SlippageExceeded
        );

        let mut creator_bought_update = None;
        if trader == campaign.creator {
            require!(
                now >= campaign.creator_buy_lock_until,
                LaunchpadError::CreatorBuyLocked
            );
            if campaign.creator_buy_cap_bps > 0 {
                let cap_tokens = u128::from(campaign.curve_token_supply)
                    .checked_mul(u128::from(campaign.creator_buy_cap_bps))
                    .ok_or(LaunchpadError::MathOverflow)?
                    .checked_div(u128::from(BPS_DENOMINATOR))
                    .ok_or(LaunchpadError::MathOverflow)?;
                let next = u128::from(campaign.creator_bought_tokens)
                    .checked_add(u128::from(tokens_out))
                    .ok_or(LaunchpadError::MathOverflow)?;
                require!(next <= cap_tokens, LaunchpadError::CreatorBuyCap);
                creator_bought_update = Some(next as u64);
            }
        }

        (
            campaign.campaign_id,
            campaign.bump,
            fee,
            net,
            tokens_out,
            campaign.sold_tokens == 0,
            creator_bought_update,
        )
    };

    if auth_required {
        let digest = build_trade_authorization_digest(
            crate::id(),
            campaign_key,
            mint_key,
            trader,
            TRADE_SIDE_BUY,
            args.lamports_in,
            args.min_tokens_out,
            args.deadline,
            &args.nonce,
        );
        create_trade_auth_account(
            &ctx.accounts.trader.to_account_info(),
            &ctx.accounts.trade_authorization.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            trader,
            campaign_key,
            TRADE_SIDE_BUY,
            &args.nonce,
            args.deadline,
            now,
            route_signer,
            digest,
            trade_auth_bump,
        )?;
    }

    invoke(
        &system_instruction::transfer(&trader, &sol_vault_key, args.lamports_in),
        &[
            ctx.accounts.trader.to_account_info(),
            ctx.accounts.sol_vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    let bump_seed = [campaign_bump];
    let seeds: &[&[u8]] = &[CAMPAIGN_SEED, campaign_id.as_ref(), &bump_seed];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.trader_token_account.to_account_info(),
                authority: ctx.accounts.campaign.to_account_info(),
            },
            &[seeds],
        ),
        tokens_out,
    )?;

    let mut data = ctx.accounts.campaign.try_borrow_mut_data()?;
    let mut slice: &[u8] = &data;
    let mut campaign = Campaign::try_deserialize(&mut slice)?;
    if let Some(v) = creator_bought_update {
        campaign.creator_bought_tokens = v;
    }
    campaign.sold_tokens = campaign
        .sold_tokens
        .checked_add(tokens_out)
        .ok_or(LaunchpadError::MathOverflow)?;
    campaign.net_raised_lamports = campaign
        .net_raised_lamports
        .checked_add(net)
        .ok_or(LaunchpadError::MathOverflow)?;
    campaign.total_buy_volume_lamports = campaign
        .total_buy_volume_lamports
        .checked_add(args.lamports_in)
        .ok_or(LaunchpadError::MathOverflow)?;
    if was_zero_sold {
        campaign.buyer_count = campaign
            .buyer_count
            .checked_add(1)
            .ok_or(LaunchpadError::MathOverflow)?;
    }
    let sold_after = campaign.sold_tokens;
    let net_after = campaign.net_raised_lamports;
    let mut cursor = std::io::Cursor::new(&mut data[..]);
    campaign.try_serialize(&mut cursor)?;

    emit!(TokensBought {
        campaign: campaign_key,
        trader,
        lamports_in: args.lamports_in,
        fee_lamports: fee,
        net_lamports: net,
        tokens_out,
        sold_tokens_after: sold_after,
        net_raised_after: net_after,
    });
    Ok(())
}

pub fn sell_tokens_handler(ctx: Context<SellTokens>, args: SellTokensArgs) -> Result<()> {
    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    require!(args.tokens_in > 0, LaunchpadError::InvalidTradeAmount);
    require!(args.deadline >= now, LaunchpadError::TradeAuthorizationExpired);
    require_keys_eq!(
        *ctx.accounts.token_program.key,
        token::ID,
        LaunchpadError::InvalidCampaign
    );

    let global = &ctx.accounts.global_config;
    require!(!global.paused, LaunchpadError::LaunchpadPaused);
    require!(!global.sell_paused, LaunchpadError::SellsPaused);

    let trader = ctx.accounts.trader.key();
    let campaign_key = ctx.accounts.campaign.key();
    let mint_key = ctx.accounts.mint.key();
    let token_vault_key = ctx.accounts.token_vault.key();
    let sol_vault_key = ctx.accounts.sol_vault.key();
    let route_signer = global.route_signer;
    let auth_required = global.authorized_trading_required;
    let trade_auth_bump = ctx.bumps.trade_authorization;

    let (fee, gross, lamports_out) = {
        let data = ctx.accounts.campaign.try_borrow_data()?;
        let mut slice: &[u8] = &data;
        let campaign = Campaign::try_deserialize(&mut slice)?;
        validate_trade_accounts(
            &campaign,
            campaign_key,
            mint_key,
            token_vault_key,
            sol_vault_key,
        )?;
        require!(!campaign.graduated, LaunchpadError::AlreadyGraduated);
        require!(now >= campaign.launch_at, LaunchpadError::TradingNotOpen);
        require!(
            campaign.curve_kind == CURVE_KIND_LINEAR_V1,
            LaunchpadError::InvalidCampaign
        );

        {
            let risk_data = ctx.accounts.risk_profile.try_borrow_data()?;
            let mut risk_slice: &[u8] = &risk_data;
            let risk = RiskProfile::try_deserialize(&mut risk_slice)?;
            require_keys_eq!(risk.wallet, trader, LaunchpadError::InvalidRiskProfile);
            require!(!risk.restricted, LaunchpadError::WalletRestricted);
        }

        if auth_required {
            let digest = build_trade_authorization_digest(
                crate::id(),
                campaign_key,
                campaign.mint,
                trader,
                TRADE_SIDE_SELL,
                args.tokens_in,
                args.min_lamports_out,
                args.deadline,
                &args.nonce,
            );
            verify_detached_trade_authorization(
                &ctx.accounts.instructions.to_account_info(),
                route_signer,
                &digest,
            )?;
        }

        let gross = quote_sell_refund(
            campaign.economics_version,
            campaign.base_price_lamports,
            campaign.price_slope_lamports,
            campaign.sold_tokens,
            args.tokens_in,
            campaign.token_decimals,
        )?;
        let fee = calculate_fee(gross, campaign.sell_fee_bps)?;
        let lamports_out = gross
            .checked_sub(fee)
            .ok_or(LaunchpadError::MathOverflow)?;
        require!(
            lamports_out >= args.min_lamports_out,
            LaunchpadError::SlippageExceeded
        );
        require!(
            campaign.net_raised_lamports >= gross,
            LaunchpadError::InsufficientVaultBalance
        );
        (fee, gross, lamports_out)
    };

    if auth_required {
        let digest = build_trade_authorization_digest(
            crate::id(),
            campaign_key,
            mint_key,
            trader,
            TRADE_SIDE_SELL,
            args.tokens_in,
            args.min_lamports_out,
            args.deadline,
            &args.nonce,
        );
        create_trade_auth_account(
            &ctx.accounts.trader.to_account_info(),
            &ctx.accounts.trade_authorization.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            trader,
            campaign_key,
            TRADE_SIDE_SELL,
            &args.nonce,
            args.deadline,
            now,
            route_signer,
            digest,
            trade_auth_bump,
        )?;
    }

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.trader_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.trader.to_account_info(),
            },
        ),
        args.tokens_in,
    )?;

    {
        let vault_info = ctx.accounts.sol_vault.to_account_info();
        let trader_info = ctx.accounts.trader.to_account_info();
        **vault_info.try_borrow_mut_lamports()? = vault_info
            .lamports()
            .checked_sub(lamports_out)
            .ok_or(LaunchpadError::MathOverflow)?;
        **trader_info.try_borrow_mut_lamports()? = trader_info
            .lamports()
            .checked_add(lamports_out)
            .ok_or(LaunchpadError::MathOverflow)?;
    }

    let mut data = ctx.accounts.campaign.try_borrow_mut_data()?;
    let mut slice: &[u8] = &data;
    let mut campaign = Campaign::try_deserialize(&mut slice)?;
    campaign.sold_tokens = campaign
        .sold_tokens
        .checked_sub(args.tokens_in)
        .ok_or(LaunchpadError::MathOverflow)?;
    campaign.net_raised_lamports = campaign
        .net_raised_lamports
        .checked_sub(gross)
        .ok_or(LaunchpadError::MathOverflow)?;
    campaign.total_sell_volume_lamports = campaign
        .total_sell_volume_lamports
        .checked_add(gross)
        .ok_or(LaunchpadError::MathOverflow)?;
    let sold_after = campaign.sold_tokens;
    let net_after = campaign.net_raised_lamports;
    let mut cursor = std::io::Cursor::new(&mut data[..]);
    campaign.try_serialize(&mut cursor)?;

    emit!(TokensSold {
        campaign: campaign_key,
        trader,
        tokens_in: args.tokens_in,
        gross_lamports: gross,
        fee_lamports: fee,
        lamports_out,
        sold_tokens_after: sold_after,
        net_raised_after: net_after,
    });
    Ok(())
}

// ── Helpers ─────────────────────────────────────────────────────────────────

fn validate_trade_accounts(
    campaign: &Campaign,
    campaign_key: Pubkey,
    mint_key: Pubkey,
    token_vault_key: Pubkey,
    sol_vault_key: Pubkey,
) -> Result<()> {
    require_keys_eq!(campaign.mint, mint_key, LaunchpadError::InvalidCampaign);
    require_keys_eq!(
        campaign.token_vault,
        token_vault_key,
        LaunchpadError::InvalidCampaign
    );
    require_keys_eq!(
        campaign.sol_vault,
        sol_vault_key,
        LaunchpadError::InvalidCampaign
    );
    let (expected_campaign, _) =
        Pubkey::find_program_address(&[CAMPAIGN_SEED, campaign.campaign_id.as_ref()], &crate::ID);
    require_keys_eq!(
        campaign_key,
        expected_campaign,
        LaunchpadError::InvalidCampaign
    );
    let (expected_vault, _) = Pubkey::find_program_address(
        &[TOKEN_VAULT_SEED, campaign.campaign_id.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(
        token_vault_key,
        expected_vault,
        LaunchpadError::InvalidCampaign
    );
    let (expected_sol, _) = Pubkey::find_program_address(
        &[SOL_VAULT_SEED, campaign.campaign_id.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(sol_vault_key, expected_sol, LaunchpadError::InvalidCampaign);
    let _ = CampaignSolVault::INIT_SPACE; // keep type linked
    Ok(())
}

fn build_trade_authorization_digest(
    program_id: Pubkey,
    campaign: Pubkey,
    mint: Pubkey,
    trader: Pubkey,
    side: u8,
    amount_in: u64,
    min_out: u64,
    deadline: i64,
    nonce: &[u8; 32],
) -> [u8; 32] {
    let mut message = Vec::with_capacity(256);
    message.extend_from_slice(TRADE_AUTH_DOMAIN);
    message.extend_from_slice(&TRADE_AUTH_SCHEMA_VERSION.to_le_bytes());
    message.extend_from_slice(program_id.as_ref());
    message.extend_from_slice(campaign.as_ref());
    message.extend_from_slice(mint.as_ref());
    message.extend_from_slice(trader.as_ref());
    message.push(side);
    message.extend_from_slice(&amount_in.to_le_bytes());
    message.extend_from_slice(&min_out.to_le_bytes());
    message.extend_from_slice(&deadline.to_le_bytes());
    message.extend_from_slice(nonce.as_ref());
    hash(&message).to_bytes()
}

fn verify_detached_trade_authorization(
    instructions_sysvar: &AccountInfo,
    expected_route_signer: Pubkey,
    expected_message: &[u8; 32],
) -> Result<()> {
    let current_index = load_current_index_checked(instructions_sysvar)
        .map_err(|_| error!(LaunchpadError::InvalidTradeAuthorization))?;
    require!(
        current_index > 0,
        LaunchpadError::InvalidTradeAuthorization
    );
    let ed25519_index = current_index
        .checked_sub(1)
        .ok_or(LaunchpadError::InvalidTradeAuthorization)?;
    let instruction = load_instruction_at_checked(usize::from(ed25519_index), instructions_sysvar)
        .map_err(|_| error!(LaunchpadError::InvalidTradeAuthorization))?;
    require_keys_eq!(
        instruction.program_id,
        ed25519_program::ID,
        LaunchpadError::InvalidTradeAuthorization
    );
    require!(
        instruction.accounts.is_empty(),
        LaunchpadError::InvalidTradeAuthorization
    );
    let parsed = parse_single_ed25519_instruction(&instruction.data)?;
    require!(
        parsed.public_key == expected_route_signer.as_ref(),
        LaunchpadError::InvalidTradeAuthorization
    );
    require!(
        parsed.message == expected_message,
        LaunchpadError::InvalidTradeAuthorization
    );
    Ok(())
}

struct ParsedEd25519Instruction<'a> {
    public_key: &'a [u8],
    message: &'a [u8],
}

fn parse_single_ed25519_instruction(data: &[u8]) -> Result<ParsedEd25519Instruction<'_>> {
    require!(
        data.len() >= ED25519_HEADER_SIZE,
        LaunchpadError::InvalidTradeAuthorization
    );
    require!(data[0] == 1, LaunchpadError::InvalidTradeAuthorization);
    require!(data[1] == 0, LaunchpadError::InvalidTradeAuthorization);

    let signature_offset = read_u16(data, 2)?;
    let signature_instruction_index = read_u16(data, 4)?;
    let public_key_offset = read_u16(data, 6)?;
    let public_key_instruction_index = read_u16(data, 8)?;
    let message_data_offset = read_u16(data, 10)?;
    let message_data_size = read_u16(data, 12)?;
    let message_instruction_index = read_u16(data, 14)?;

    require!(
        signature_instruction_index == ED25519_CURRENT_INSTRUCTION,
        LaunchpadError::InvalidTradeAuthorization
    );
    require!(
        public_key_instruction_index == ED25519_CURRENT_INSTRUCTION,
        LaunchpadError::InvalidTradeAuthorization
    );
    require!(
        message_instruction_index == ED25519_CURRENT_INSTRUCTION,
        LaunchpadError::InvalidTradeAuthorization
    );

    checked_slice(data, signature_offset, ED25519_SIGNATURE_SIZE)?;
    let public_key = checked_slice(data, public_key_offset, ED25519_PUBLIC_KEY_SIZE)?;
    let message = checked_slice(data, message_data_offset, usize::from(message_data_size))?;
    Ok(ParsedEd25519Instruction {
        public_key,
        message,
    })
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16> {
    let end = offset.checked_add(2).ok_or(LaunchpadError::MathOverflow)?;
    require!(
        end <= data.len(),
        LaunchpadError::InvalidTradeAuthorization
    );
    Ok(u16::from_le_bytes([data[offset], data[offset + 1]]))
}

fn checked_slice(data: &[u8], offset: u16, len: usize) -> Result<&[u8]> {
    let start = usize::from(offset);
    let end = start.checked_add(len).ok_or(LaunchpadError::MathOverflow)?;
    require!(
        end <= data.len(),
        LaunchpadError::InvalidTradeAuthorization
    );
    Ok(&data[start..end])
}

fn create_trade_auth_account<'info>(
    payer: &AccountInfo<'info>,
    account: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    trader: Pubkey,
    campaign: Pubkey,
    side: u8,
    nonce: &[u8; 32],
    deadline: i64,
    used_at: i64,
    route_signer: Pubkey,
    message_hash: [u8; 32],
    bump: u8,
) -> Result<()> {
    require!(account.lamports() == 0, LaunchpadError::InvalidTradeAuthorization);
    require!(account.data_is_empty(), LaunchpadError::InvalidTradeAuthorization);
    let space = 8 + TradeAuthorization::INIT_SPACE;
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(space);
    let seeds: &[&[u8]] = &[TRADE_AUTH_SEED, trader.as_ref(), nonce.as_ref(), &[bump]];
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            account.key,
            lamports,
            space as u64,
            &crate::ID,
        ),
        &[payer.clone(), account.clone(), system_program.clone()],
        &[seeds],
    )?;
    let body = TradeAuthorization {
        trader,
        campaign,
        side,
        nonce: *nonce,
        deadline,
        used_at,
        route_signer,
        message_hash,
        schema_version: TRADE_AUTH_SCHEMA_VERSION,
        bump,
    };
    let mut data = account.try_borrow_mut_data()?;
    let mut cursor = std::io::Cursor::new(&mut data[..]);
    body.try_serialize(&mut cursor)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_cost_base_only_v1() {
        // V1: 10 raw units at base 1000, slope 0 → 10_000 lamports
        let cost = checked_linear_curve_cost(ECONOMICS_VERSION_V1, 1000, 0, 0, 10, 6).unwrap();
        assert_eq!(cost, 10_000);
    }

    #[test]
    fn linear_cost_v2_bnb_parity_first_token() {
        // V2: base=1 lamport per whole token, 6 decimals → 1 full token costs 1 lamport
        let one_token = 1_000_000u64;
        let cost = checked_linear_curve_cost(ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, 1, 0, 0, one_token, 6).unwrap();
        assert_eq!(cost, 1);
    }

    #[test]
    fn quote_buy_v2_point_zero_one_sol() {
        // 0.01 SOL net; base=1 lamport/whole token, slope=0 → ~9.8M whole tokens.
        let net = 9_800_000u64;
        let supply = 840_000_000_000_000u64; // 840M @ 6 dec (84% of 1B)
        let tokens =
            quote_buy_tokens(ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, 1, 0, 0, supply, net, 6).unwrap();
        // ~net * 1e6 / base = 9.8e12 raw ≈ 9.8e6 whole tokens
        assert!(tokens > 1_000_000_000_000); // > 1M whole tokens
        let cost = checked_linear_curve_cost(ECONOMICS_VERSION_V1, ECONOMICS_VERSION_V2, 1, 0, 0, tokens, 6).unwrap();
        assert!(cost <= net);
        assert_eq!(tokens, 9_800_000_000_000);
    }

    #[test]
    fn quote_buy_roundtrip_v1() {
        let base = 1000u64;
        let slope = 10u64;
        let sold = 0u64;
        let net = 50_000u64;
        let tokens =
            quote_buy_tokens(ECONOMICS_VERSION_V1, base, slope, sold, 1_000_000, net, 6).unwrap();
        let cost =
            checked_linear_curve_cost(ECONOMICS_VERSION_V1, base, slope, sold, tokens, 6).unwrap();
        assert!(cost <= net);
        if tokens + 1 <= 1_000_000 {
            let over = checked_linear_curve_cost(
                ECONOMICS_VERSION_V1,
                base,
                slope,
                sold,
                tokens + 1,
                6,
            )
            .unwrap();
            assert!(over > net);
        }
    }

    #[test]
    fn sell_is_reverse_of_buy_path_v1() {
        let base = 1000u64;
        let slope = 10u64;
        let buy_tokens = 100u64;
        let cost =
            checked_linear_curve_cost(ECONOMICS_VERSION_V1, base, slope, 0, buy_tokens, 6).unwrap();
        let refund = quote_sell_refund(
            ECONOMICS_VERSION_V1,
            base,
            slope,
            buy_tokens,
            buy_tokens,
            6,
        )
        .unwrap();
        assert_eq!(cost, refund);
    }
}
