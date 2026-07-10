// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {LaunchToken} from "./token/LaunchToken.sol";
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";

interface IPhase1TreasuryRouter {
    function route(uint8 kind, uint8 profile) external payable;
}

interface IPancakeV2FactoryLike {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IRouteAuthoritySource {
    function routeAuthority() external view returns (address);
}

interface IRiskRegistryView {
    function assertWalletCanTrade(address wallet) external view;
}

interface ILaunchFactoryGraduationNotify {
    function notifyCampaignGraduated(address creator) external;
}

/// @notice Pump.fun inspired bonding curve launch campaign that targets PancakeSwap for final liquidity.
contract LaunchCampaign is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    struct InitParams {
        string name;
        string symbol;
        string logoURI;
        string xAccount;
        string website;
        string extraLink;
        uint256 totalSupply;
        uint256 curveBps;
        uint256 liquidityTokenBps;
        uint256 basePrice;
        uint256 priceSlope;
        uint256 graduationTarget;
        uint256 liquidityBps;
        uint256 protocolFeeBps;
        uint256 leagueFeeBps;
        address leagueReceiver;
        address router;
        address lpReceiver;
        address feeRecipient;
        address creator;
        address factory;
        address creatorRegistry;
        address riskRegistry;
        uint256 creatorBuyLockUntil;
        uint256 creatorBuyCapWei;
        bool requireAuthorizedTrading;
        uint8 tradeRouteProfile;
        uint8 finalizeRouteProfile;
    }

    struct GraduationState {
        address dexPair;
        uint256 finalCurvePrice;
        uint256 initialDexPrice;
        uint256 graduatedLiquidityTokens;
        uint256 graduatedLiquidityBnb;
        uint256 graduatedLiquidityLp;
        uint256 burnedUnsoldTokens;
        uint256 burnedUnusedLpTokens;
        uint256 postBurnTotalSupply;
        uint256 graduationBalance;
        uint256 graduationOvershoot;
    }

    uint256 private constant WAD = 1e18;
    uint256 private constant MAX_BPS = 10_000;
    uint256 private constant GRADUATION_PRICE_TOLERANCE_BPS = 50;
    uint8 private constant ROUTE_KIND_TRADE = 0;
    uint8 private constant ROUTE_KIND_FINALIZE = 1;
    uint8 private constant ROUTE_PROFILE_STANDARD_LINKED = 0;
    uint8 private constant ROUTE_PROFILE_STANDARD_UNLINKED = 1;
    uint8 private constant ROUTE_PROFILE_OG_LINKED = 2;

    LaunchToken public token;
    IERC20 private tokenInterface;
    IPancakeRouter02 public router;
    address public factory;
    address public feeRecipient;
    address public leagueReceiver;
    uint256 public leagueFeeBps;
    address public lpReceiver;
    uint8 public tradeRouteProfile;
    uint8 public finalizeRouteProfile;

    string public logoURI;
    string public xAccount;
    string public website;
    string public extraLink;

    uint256 public basePrice;
    uint256 public priceSlope;
    uint256 public graduationTarget;
    uint256 public liquidityBps;
    uint256 public protocolFeeBps;

    uint256 public totalSupply;
    uint256 public curveSupply;
    uint256 public liquiditySupply;
    uint256 public creatorReserve;

    uint256 public sold;
    bool public launched;
    uint256 public finalizedAt;
    GraduationState private graduation;

    address public creator;
    address public creatorRegistry;
    address public riskRegistry;
    uint256 public creatorBuyLockUntil;
    uint256 public creatorBuyCapWei;
    uint256 public creatorBoughtWei;
    bool public paused;
    bool public buyPaused;
    bool public sellPaused;
    bool public graduationPaused;
    bool public requireAuthorizedTrading;

    modifier onlyFactory() {
        require(msg.sender == factory, "ONLY_FACTORY");
        _;
    }

    uint256 public totalBuyVolumeWei;
    uint256 public totalSellVolumeWei;
    uint256 public buyersCount;
    mapping(address => bool) public hasBought;
    mapping(address => uint256) public pendingNative;
    uint256 public pendingNativeTotal;

    event TokensPurchased(address indexed buyer, uint256 amountOut, uint256 cost);
    event TokensSold(address indexed seller, uint256 amountIn, uint256 payout);
    event NativeEscrowed(address indexed beneficiary, uint256 amount);
    event NativeClaimed(address indexed beneficiary, uint256 amount);
    event CampaignPauseStateUpdated(bool paused, bool buyPaused, bool sellPaused, bool graduationPaused);
    event RequireAuthorizedTradingUpdated(bool required);
    event CampaignFinalized(
        address indexed caller,
        address indexed pair,
        uint256 graduationBalance,
        uint256 graduationOvershoot,
        uint256 liquidityTokens,
        uint256 liquidityBnb,
        uint256 liquidityLp,
        uint256 protocolFee,
        uint256 creatorPayout,
        uint256 burnedUnsoldTokens,
        uint256 burnedUnusedLpTokens,
        uint256 finalCurvePrice,
        uint256 initialDexPrice,
        uint256 postBurnTotalSupply
    );

    error LpTokensZero();
    error InsufficientLpAllocation();
    error LiquidityZero();
    error PairMissing();
    error DexPriceDrift();

    bool private _initialized;

    constructor() Ownable(address(1)) {
        _initialized = true;
    }

    function initialize(InitParams memory params) external {
        require(!_initialized, "initialized");
        _initialized = true;

        require(params.totalSupply > 0, "invalid supply");
        require(params.curveBps > 0 && params.curveBps < MAX_BPS, "curve bps");
        require(params.curveBps + params.liquidityTokenBps <= MAX_BPS, "portion overflow");
        require(params.basePrice > 0, "price zero");
        require(params.priceSlope > 0, "slope zero");
        require(params.router != address(0), "router zero");
        require(params.creator != address(0), "creator zero");
        require(params.liquidityBps <= MAX_BPS, "liquidity bps");
        require(params.protocolFeeBps <= MAX_BPS, "protocol bps");
        require(params.leagueFeeBps <= params.protocolFeeBps, "league>protocol");
        require(params.leagueReceiver != address(0), "league receiver zero");
        require(bytes(params.logoURI).length > 0, "logo uri");
        require(_isValidRouteProfile(params.tradeRouteProfile), "trade route profile");
        require(_isValidRouteProfile(params.finalizeRouteProfile), "finalize route profile");

        _transferOwnership(params.creator);

        logoURI = params.logoURI;
        xAccount = params.xAccount;
        website = params.website;
        extraLink = params.extraLink;
        basePrice = params.basePrice;
        priceSlope = params.priceSlope;
        graduationTarget = params.graduationTarget;
        liquidityBps = params.liquidityBps;
        protocolFeeBps = params.protocolFeeBps;
        factory = params.factory;
        feeRecipient = params.feeRecipient;
        leagueReceiver = params.leagueReceiver;
        leagueFeeBps = params.leagueFeeBps;
        lpReceiver = params.lpReceiver == address(0) ? params.creator : params.lpReceiver;
        router = IPancakeRouter02(params.router);
        tradeRouteProfile = params.tradeRouteProfile;
        finalizeRouteProfile = params.finalizeRouteProfile;
        creator = params.creator;
        creatorRegistry = params.creatorRegistry;
        riskRegistry = params.riskRegistry;
        creatorBuyLockUntil = params.creatorBuyLockUntil;
        creatorBuyCapWei = params.creatorBuyCapWei;
        requireAuthorizedTrading = params.requireAuthorizedTrading;

        totalSupply = params.totalSupply;
        curveSupply = (params.totalSupply * params.curveBps) / MAX_BPS;
        liquiditySupply = (params.totalSupply * params.liquidityTokenBps) / MAX_BPS;
        creatorReserve = params.totalSupply - curveSupply - liquiditySupply;
        require(liquiditySupply > 0, "liquidity zero");

        token = new LaunchToken(params.name, params.symbol, params.totalSupply, address(this));
        tokenInterface = IERC20(address(token));
        token.mint(address(this), params.totalSupply);
    }

    receive() external payable {}

    function setPauseState(bool paused_, bool buyPaused_, bool sellPaused_, bool graduationPaused_) external onlyFactory {
        paused = paused_;
        buyPaused = buyPaused_;
        sellPaused = sellPaused_;
        graduationPaused = graduationPaused_;
        emit CampaignPauseStateUpdated(paused_, buyPaused_, sellPaused_, graduationPaused_);
    }

    function setRequireAuthorizedTrading(bool required) external onlyFactory {
        requireAuthorizedTrading = required;
        emit RequireAuthorizedTradingUpdated(required);
    }

    function quoteBuyExactTokens(uint256 amountOut) public view returns (uint256) {
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");
        uint256 cost = _quoteBuyNoFee(amountOut);
        return cost + _fee(cost);
    }

    function quoteBuyExactBnb(uint256 totalInWei) public view returns (uint256 tokensOut, uint256 totalCostWei, uint256 feeWei) {
        if (totalInWei == 0 || launched) return (0, 0, 0);
        uint256 remaining = curveSupply - sold;
        if (remaining == 0) return (0, 0, 0);

        uint256 lo = 0;
        uint256 hi = remaining;
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            uint256 costNoFee = _quoteBuyNoFee(mid);
            uint256 fee = _fee(costNoFee);
            uint256 total = costNoFee + fee;
            if (total <= totalInWei) lo = mid;
            else hi = mid - 1;
        }

        if (lo == 0) return (0, 0, 0);
        uint256 costNoFeeFinal = _quoteBuyNoFee(lo);
        feeWei = _fee(costNoFeeFinal);
        totalCostWei = costNoFeeFinal + feeWei;
        return (lo, totalCostWei, feeWei);
    }

    function quoteSellExactTokens(uint256 amountIn) public view returns (uint256) {
        require(amountIn > 0, "zero amount");
        require(amountIn <= sold, "exceeds sold");
        uint256 payout = _quoteSellNoFee(amountIn);
        uint256 fee = _fee(payout);
        return payout - fee;
    }

    function currentPrice() external view returns (uint256) {
        return _currentPrice();
    }

    function getGraduationState()
        external
        view
        returns (
            address dexPair,
            uint256 finalCurvePrice,
            uint256 initialDexPrice,
            uint256 graduatedLiquidityTokens,
            uint256 graduatedLiquidityBnb,
            uint256 graduatedLiquidityLp,
            uint256 burnedUnsoldTokens,
            uint256 burnedUnusedLpTokens,
            uint256 postBurnTotalSupply,
            uint256 graduationBalance,
            uint256 graduationOvershoot
        )
    {
        GraduationState memory g = graduation;
        return (
            g.dexPair,
            g.finalCurvePrice,
            g.initialDexPrice,
            g.graduatedLiquidityTokens,
            g.graduatedLiquidityBnb,
            g.graduatedLiquidityLp,
            g.burnedUnsoldTokens,
            g.burnedUnusedLpTokens,
            g.postBurnTotalSupply,
            g.graduationBalance,
            g.graduationOvershoot
        );
    }

    function buyExactTokens(uint256 amountOut, uint256 maxCost) external payable nonReentrant returns (uint256 cost) {
        _requireDirectTradeAllowed();
        return _buyExactTokens(msg.sender, amountOut, maxCost, false, 0);
    }

    function buyExactTokensAuthorized(
        uint256 amountOut,
        uint256 maxCost,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external payable nonReentrant returns (uint256 cost) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        return _buyExactTokens(msg.sender, amountOut, maxCost, true, routeProfile);
    }

    function buyExactBnb(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut, uint256 totalSpent) {
        _requireDirectTradeAllowed();
        return _buyExactBnb(msg.sender, minTokensOut, false, 0);
    }

    function buyExactBnbAuthorized(
        uint256 minTokensOut,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external payable nonReentrant returns (uint256 tokensOut, uint256 totalSpent) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        return _buyExactBnb(msg.sender, minTokensOut, true, routeProfile);
    }

    function sellExactTokens(uint256 amountIn, uint256 minPayout) external nonReentrant returns (uint256 payout) {
        _requireDirectTradeAllowed();
        return _sellExactTokens(msg.sender, amountIn, minPayout, false, 0);
    }

    function sellExactTokensAuthorized(
        uint256 amountIn,
        uint256 minPayout,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external nonReentrant returns (uint256 payout) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        return _sellExactTokens(msg.sender, amountIn, minPayout, true, routeProfile);
    }

    function claimPendingNative() external nonReentrant returns (uint256 amount) {
        amount = pendingNative[msg.sender];
        require(amount > 0, "no pending");
        pendingNative[msg.sender] = 0;
        pendingNativeTotal -= amount;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) {
            pendingNative[msg.sender] = amount;
            pendingNativeTotal += amount;
            revert("claim failed");
        }
        emit NativeClaimed(msg.sender, amount);
    }

    function finalize(uint256 minTokens, uint256 minBnb) external onlyOwner nonReentrant returns (uint256 usedTokens, uint256 usedBnb) {
        return _finalize(minTokens, minBnb, msg.sender);
    }

    function _buyExactTokens(address buyer, uint256 amountOut, uint256 maxCost, bool useAuthorizedRoute, uint8 routeProfile) internal returns (uint256 cost) {
        require(!launched, "campaign launched");
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");
        uint256 costNoFee = _quoteBuyNoFee(amountOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total <= maxCost, "slippage");
        require(msg.value >= total, "insufficient value");
        _beforeBuy(buyer, costNoFee);
        _recordBuy(buyer, amountOut, costNoFee);
        if (fee > 0) {
            if (useAuthorizedRoute) _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, costNoFee, routeProfile);
            else _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }
        if (msg.value > total) _sendNative(msg.sender, msg.value - total);
        _autoFinalizeIfEligible(buyer);
        emit TokensPurchased(buyer, amountOut, total);
        return total;
    }

    function _buyExactBnb(address buyer, uint256 minTokensOut, bool useAuthorizedRoute, uint8 routeProfile) internal returns (uint256 tokensOut, uint256 totalSpent) {
        require(!launched, "campaign launched");
        (tokensOut, totalSpent, ) = quoteBuyExactBnb(msg.value);
        require(tokensOut > 0, "zero amount");
        require(tokensOut >= minTokensOut, "slippage");
        require(sold + tokensOut <= curveSupply, "sold out");
        uint256 costNoFee = _quoteBuyNoFee(tokensOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total == totalSpent, "quote mismatch");
        _beforeBuy(buyer, costNoFee);
        _recordBuy(buyer, tokensOut, costNoFee);
        if (fee > 0) {
            if (useAuthorizedRoute) _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, costNoFee, routeProfile);
            else _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }
        if (msg.value > total) _sendNative(msg.sender, msg.value - total);
        _autoFinalizeIfEligible(buyer);
        emit TokensPurchased(buyer, tokensOut, total);
        return (tokensOut, total);
    }

    function _sellExactTokens(address seller, uint256 amountIn, uint256 minPayout, bool useAuthorizedRoute, uint8 routeProfile) internal returns (uint256 payout) {
        require(!launched, "campaign launched");
        require(amountIn > 0, "zero amount");
        require(amountIn <= sold, "exceeds sold");
        _beforeSell(seller);
        uint256 gross = _quoteSellNoFee(amountIn);
        require(gross <= _availableNativeBalance(), "insolvent");
        uint256 fee = _fee(gross);
        payout = gross - fee;
        require(payout >= minPayout, "slippage");
        sold -= amountIn;
        tokenInterface.safeTransferFrom(seller, address(this), amountIn);
        if (fee > 0) {
            if (useAuthorizedRoute) _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, gross, routeProfile);
            else _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, gross);
        }
        _sendNative(seller, payout);
        totalSellVolumeWei += gross;
        emit TokensSold(seller, amountIn, payout);
        return payout;
    }

    function _recordBuy(address buyer, uint256 amountOut, uint256 costNoFee) internal {
        totalBuyVolumeWei += costNoFee;
        if (!hasBought[buyer]) {
            hasBought[buyer] = true;
            buyersCount += 1;
        }
        sold += amountOut;
        tokenInterface.safeTransfer(buyer, amountOut);
    }

    function _beforeBuy(address buyer, uint256 costNoFee) internal {
        require(!paused, "campaign paused");
        require(!buyPaused, "buys paused");
        _assertWalletCanTrade(buyer);
        if (buyer == creator) {
            require(block.timestamp >= creatorBuyLockUntil, "creator buy locked");
            if (creatorBuyCapWei > 0) require(creatorBoughtWei + costNoFee <= creatorBuyCapWei, "creator buy cap");
            creatorBoughtWei += costNoFee;
        }
    }

    function _beforeSell(address seller) internal view {
        require(!paused, "campaign paused");
        require(!sellPaused, "sells paused");
        _assertWalletCanTrade(seller);
    }

    function _assertWalletCanTrade(address wallet) internal view {
        if (riskRegistry == address(0)) return;
        IRiskRegistryView(riskRegistry).assertWalletCanTrade(wallet);
    }

    function _requireDirectTradeAllowed() internal view {
        require(!requireAuthorizedTrading, "authorized trading required");
    }

    function _autoFinalizeIfEligible(address caller) internal {
        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) _finalize(0, 0, caller);
    }

    function _finalize(uint256 minTokens, uint256 minBnb, address caller) internal returns (uint256 usedTokens, uint256 usedBnb) {
        require(!paused, "campaign paused");
        require(!graduationPaused, "graduation paused");
        require(!launched, "finalized");
        require(sold == curveSupply || _availableNativeBalance() >= graduationTarget, "threshold");
        launched = true;
        finalizedAt = block.timestamp;

        GraduationState storage g = graduation;
        g.graduationBalance = _availableNativeBalance();
        g.graduationOvershoot = g.graduationBalance > graduationTarget ? g.graduationBalance - graduationTarget : 0;
        g.finalCurvePrice = _currentPrice();

        uint256 protocolFee = (g.graduationBalance * protocolFeeBps) / MAX_BPS;
        if (protocolFee > 0 && feeRecipient != address(0)) _routeFeeOrSendLegacy(protocolFee, ROUTE_KIND_FINALIZE, g.graduationBalance);

        uint256 remainingAfterFee = _availableNativeBalance();
        uint256 liquidityValue = (remainingAfterFee * liquidityBps) / MAX_BPS;
        uint256 lpTokensDesired = Math.mulDiv(liquidityValue, WAD, g.finalCurvePrice);
        if (lpTokensDesired == 0) revert LpTokensZero();
        if (lpTokensDesired > liquiditySupply) revert InsufficientLpAllocation();

        tokenInterface.forceApprove(address(router), lpTokensDesired);
        (usedTokens, usedBnb, g.graduatedLiquidityLp) = router.addLiquidityETH{value: liquidityValue}(
            address(token),
            lpTokensDesired,
            minTokens,
            minBnb,
            lpReceiver,
            block.timestamp + 30 minutes
        );
        tokenInterface.forceApprove(address(router), 0);
        if (usedTokens == 0 || usedBnb == 0) revert LiquidityZero();

        g.graduatedLiquidityTokens = usedTokens;
        g.graduatedLiquidityBnb = usedBnb;
        g.initialDexPrice = Math.mulDiv(usedBnb, WAD, usedTokens);
        _requirePriceWithinTolerance(g.initialDexPrice, g.finalCurvePrice);

        g.dexPair = IPancakeV2FactoryLike(router.factory()).getPair(address(token), router.WETH());
        if (g.dexPair == address(0)) revert PairMissing();

        g.burnedUnusedLpTokens = liquiditySupply - usedTokens;
        if (g.burnedUnusedLpTokens > 0) token.burn(address(this), g.burnedUnusedLpTokens);

        g.burnedUnsoldTokens = curveSupply - sold;
        if (g.burnedUnsoldTokens > 0) token.burn(address(this), g.burnedUnsoldTokens);
        if (creatorReserve > 0) tokenInterface.safeTransfer(owner(), creatorReserve);
        uint256 creatorPayout = _availableNativeBalance();
        if (creatorPayout > 0) _sendNative(owner(), creatorPayout);
        g.postBurnTotalSupply = token.totalSupply();
        token.enableTrading();

        if (factory != address(0)) ILaunchFactoryGraduationNotify(factory).notifyCampaignGraduated(creator);
        emit CampaignFinalized(
            caller,
            g.dexPair,
            g.graduationBalance,
            g.graduationOvershoot,
            usedTokens,
            usedBnb,
            g.graduatedLiquidityLp,
            protocolFee,
            creatorPayout,
            g.burnedUnsoldTokens,
            g.burnedUnusedLpTokens,
            g.finalCurvePrice,
            g.initialDexPrice,
            g.postBurnTotalSupply
        );
    }

    function _fee(uint256 amountWei) internal view returns (uint256) {
        if (protocolFeeBps == 0) return 0;
        return (amountWei * protocolFeeBps) / MAX_BPS;
    }

    function _feeSplit(uint256 amountWei) internal view returns (uint256 totalFeeWei, uint256 protocolNetFeeWei, uint256 leagueFeeWei) {
        totalFeeWei = _fee(amountWei);
        if (totalFeeWei == 0) return (0, 0, 0);
        leagueFeeWei = (amountWei * leagueFeeBps) / MAX_BPS;
        if (leagueReceiver == address(0) || leagueFeeWei == 0) return (totalFeeWei, totalFeeWei, 0);
        if (leagueFeeWei > totalFeeWei) leagueFeeWei = totalFeeWei;
        protocolNetFeeWei = totalFeeWei - leagueFeeWei;
    }

    function _useUnifiedRewardRouter() internal view returns (bool) {
        address receiver = feeRecipient;
        if (receiver == address(0) || receiver != leagueReceiver) return false;
        uint256 size;
        assembly {
            size := extcodesize(receiver)
        }
        return size > 0;
    }

    function _routeFeeOrSendLegacy(uint256 feeAmount, uint8 routeKind, uint256 feeBaseAmount) internal {
        _routeFeeOrSendLegacyWithProfile(feeAmount, routeKind, feeBaseAmount, _routeProfileForKind(routeKind));
    }

    function _routeFeeOrSendLegacyWithProfile(uint256 feeAmount, uint8 routeKind, uint256 feeBaseAmount, uint8 routeProfile) internal {
        if (feeAmount == 0) return;
        if (_useUnifiedRewardRouter()) {
            IPhase1TreasuryRouter(payable(feeRecipient)).route{value: feeAmount}(routeKind, routeProfile);
            return;
        }
        if (routeKind == ROUTE_KIND_FINALIZE) {
            if (feeRecipient != address(0)) _sendNativeFee(payable(feeRecipient), feeAmount);
            return;
        }
        (, uint256 protocolNet, uint256 leagueFee) = _feeSplit(feeBaseAmount);
        if (protocolNet > 0 && feeRecipient != address(0)) _sendNativeFee(payable(feeRecipient), protocolNet);
        if (leagueFee > 0) _sendNativeFee(payable(leagueReceiver), leagueFee);
    }

    function _routeProfileForKind(uint8 routeKind) internal view returns (uint8) {
        if (routeKind == ROUTE_KIND_FINALIZE) return finalizeRouteProfile;
        return tradeRouteProfile;
    }

    function _verifyTradeRouteAuthorization(address actor, uint8 routeProfile, uint64 deadline, bytes calldata signature) internal view {
        require(deadline >= block.timestamp, "route auth expired");
        require(_isValidRouteProfile(routeProfile), "trade route profile");
        address authority = IRouteAuthoritySource(factory).routeAuthority();
        require(authority != address(0), "route auth unavailable");
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encodePacked("MWZ_ROUTE_TRADE_AUTH", block.chainid, address(this), actor, routeProfile, deadline))
        );
        require(digest.recover(signature) == authority, "bad route auth");
    }

    function _currentPrice() internal view returns (uint256) {
        return basePrice + Math.mulDiv(priceSlope, sold, WAD);
    }

    function _requirePriceWithinTolerance(uint256 actualPrice, uint256 expectedPrice) internal pure {
        uint256 diff = actualPrice > expectedPrice ? actualPrice - expectedPrice : expectedPrice - actualPrice;
        if (Math.mulDiv(diff, MAX_BPS, expectedPrice) > GRADUATION_PRICE_TOLERANCE_BPS) revert DexPriceDrift();
    }

    function _quoteBuyNoFee(uint256 amountOut) internal view returns (uint256) {
        return _area(sold + amountOut) - _area(sold);
    }

    function _quoteSellNoFee(uint256 amountIn) internal view returns (uint256) {
        return _area(sold) - _area(sold - amountIn);
    }

    function _isValidRouteProfile(uint8 profile) internal pure returns (bool) {
        return profile == ROUTE_PROFILE_STANDARD_LINKED || profile == ROUTE_PROFILE_STANDARD_UNLINKED || profile == ROUTE_PROFILE_OG_LINKED;
    }

    function _area(uint256 x) internal view returns (uint256) {
        uint256 linear = Math.mulDiv(x, basePrice, WAD);
        uint256 square;
        unchecked {
            square = x * x;
        }
        uint256 slopeTerm = Math.mulDiv(priceSlope, square, 2 * WAD * WAD);
        return linear + slopeTerm;
    }

    function _sendNativeFee(address payable to, uint256 value) private {
        if (value == 0) return;
        (bool ok, ) = to.call{value: value}("");
        if (!ok) {
            pendingNative[to] += value;
            pendingNativeTotal += value;
            emit NativeEscrowed(to, value);
        }
    }

    function _availableNativeBalance() internal view returns (uint256) {
        uint256 balance = address(this).balance;
        uint256 reserved = pendingNativeTotal;
        if (reserved >= balance) return 0;
        return balance - reserved;
    }

    function _sendNative(address to, uint256 value) private {
        if (value == 0) return;
        (bool success, ) = to.call{value: value}("");
        require(success, "transfer failed");
    }
}