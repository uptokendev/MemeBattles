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

interface IRouteAuthoritySource {
    function routeAuthority() external view returns (address);
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
        uint8 tradeRouteProfile;
        uint8 finalizeRouteProfile;
    }

    uint256 private constant WAD = 1e18;
    uint256 private constant MAX_BPS = 10_000;
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

    modifier onlyFactory() {
        require(msg.sender == factory, "ONLY_FACTORY");
        _;
    }

// ---- Phase 2 cheap counters (no backend / no log scanning) ----
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
    event CampaignFinalized(
        address indexed caller,
        uint256 liquidityTokens,
        uint256 liquidityBnb,
        uint256 protocolFee,
        uint256 creatorPayout
    );

    bool private _initialized;

/// @dev The implementation contract is deployed once and locked in its constructor.
///      Clones start uninitialized and must call initialize() exactly once.
constructor() Ownable(address(1)) {
    _initialized = true;
}

function initialize(InitParams memory params) external {
    require(!_initialized, "initialized");
    _initialized = true;

    require(params.totalSupply > 0, "invalid supply");
    require(params.curveBps > 0 && params.curveBps < MAX_BPS, "curve bps");
    require(
        params.curveBps + params.liquidityTokenBps <= MAX_BPS,
        "portion overflow"
    );
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

    // set owner to creator
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
    lpReceiver = params.lpReceiver == address(0)
        ? params.creator
        : params.lpReceiver;
    router = IPancakeRouter02(params.router);
    tradeRouteProfile = params.tradeRouteProfile;
    finalizeRouteProfile = params.finalizeRouteProfile;

    totalSupply = params.totalSupply;
    curveSupply = (params.totalSupply * params.curveBps) / MAX_BPS;
    liquiditySupply =
        (params.totalSupply * params.liquidityTokenBps) /
        MAX_BPS;
    creatorReserve = params.totalSupply - curveSupply - liquiditySupply;
    require(liquiditySupply > 0, "liquidity zero");
    require(creatorReserve >= 0, "creator portion");

    token = new LaunchToken(
        params.name,
        params.symbol,
        params.totalSupply,
        address(this)
    );
    tokenInterface = IERC20(address(token));
    token.mint(address(this), params.totalSupply);
}

receive() external payable {}

    function _fee(uint256 amountWei) internal view returns (uint256) {
        if (protocolFeeBps == 0) return 0;
        return (amountWei * protocolFeeBps) / MAX_BPS;
    }

    function _feeSplit(uint256 amountWei)
        internal
        view
        returns (uint256 totalFeeWei, uint256 protocolNetFeeWei, uint256 leagueFeeWei)
    {
        totalFeeWei = _fee(amountWei);
        if (totalFeeWei == 0) return (0, 0, 0);

        // league fee is a fixed bps slice of the same base amount used to compute the total fee.
        // This keeps user-visible fees unchanged while funding the League from inside the existing fee.
        leagueFeeWei = (amountWei * leagueFeeBps) / MAX_BPS;

        if (leagueReceiver == address(0) || leagueFeeWei == 0) {
            // Fallback: if league receiver isn't set, everything goes to protocol feeRecipient.
            return (totalFeeWei, totalFeeWei, 0);
        }

        // Guard: never exceed the total fee (e.g., if protocolFeeBps is configured too low)
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

    function _routeFeeOrSendLegacyWithProfile(
        uint256 feeAmount,
        uint8 routeKind,
        uint256 feeBaseAmount,
        uint8 routeProfile
    ) internal {
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

    function _isValidRouteProfile(uint8 profile) internal pure returns (bool) {
        return
            profile == ROUTE_PROFILE_STANDARD_LINKED ||
            profile == ROUTE_PROFILE_STANDARD_UNLINKED ||
            profile == ROUTE_PROFILE_OG_LINKED;
    }

    function _verifyTradeRouteAuthorization(
        address actor,
        uint8 routeProfile,
        uint64 deadline,
        bytes calldata signature
    ) internal view {
        require(deadline >= block.timestamp, "route auth expired");
        require(_isValidRouteProfile(routeProfile), "trade route profile");
        address authority = IRouteAuthoritySource(factory).routeAuthority();
        require(authority != address(0), "route auth unavailable");

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encodePacked(
                    "MWZ_ROUTE_TRADE_AUTH",
                    block.chainid,
                    address(this),
                    actor,
                    routeProfile,
                    deadline
                )
            )
        );

        require(digest.recover(signature) == authority, "bad route auth");
    }

    function _quoteBuyNoFee(uint256 amountOut) internal view returns (uint256) {
        return _area(sold + amountOut) - _area(sold);
    }

    function _quoteSellNoFee(uint256 amountIn) internal view returns (uint256) {
        return _area(sold) - _area(sold - amountIn);
    }

    function quoteBuyExactTokens(uint256 amountOut) public view returns (uint256) {
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");
        uint256 cost = _quoteBuyNoFee(amountOut);
        return cost + _fee(cost);
    }

    /// @notice Quote the maximum tokens obtainable for an exact total BNB input (including protocol fee).
    /// @dev Uses a monotonic binary search over amountOut to avoid fragile quadratic math.
    /// Returns (tokensOut, totalCostWei, feeWei) where totalCostWei <= totalInWei.
    function quoteBuyExactBnb(uint256 totalInWei)
        public
        view
        returns (uint256 tokensOut, uint256 totalCostWei, uint256 feeWei)
    {
        if (totalInWei == 0) return (0, 0, 0);
        if (launched) return (0, 0, 0);

        uint256 remaining = curveSupply - sold;
        if (remaining == 0) return (0, 0, 0);

        uint256 lo = 0;
        uint256 hi = remaining;

        // Find max x such that cost(x) <= totalInWei
        while (lo < hi) {
            uint256 mid = (lo + hi + 1) / 2;
            uint256 costNoFee = _quoteBuyNoFee(mid);
            uint256 fee = _fee(costNoFee);
            uint256 total = costNoFee + fee;

            if (total <= totalInWei) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
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
        return basePrice + Math.mulDiv(priceSlope, sold, WAD);
    }

    function buyExactTokens(uint256 amountOut, uint256 maxCost)
        external
        payable
        nonReentrant
        returns (uint256 cost)
    {
        require(!launched, "campaign launched");
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");
        uint256 costNoFee = _quoteBuyNoFee(amountOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total <= maxCost, "slippage");
        require(msg.value >= total, "insufficient value");

// Phase 2 counters (volume excludes protocol fee)
totalBuyVolumeWei += costNoFee;
if (!hasBought[msg.sender]) {
    hasBought[msg.sender] = true;
    buyersCount += 1;
}

        sold += amountOut;
        tokenInterface.safeTransfer(msg.sender, amountOut);

        if (fee > 0) {
            _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        // Auto-finalize (graduate) immediately once the campaign becomes eligible.
        // This matches pump.fun / gra.fun style behavior: the completion trade triggers LP deployment.
        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, msg.sender);
        }

        emit TokensPurchased(msg.sender, amountOut, total);
        return total;
    }

    function buyExactTokensAuthorized(
        uint256 amountOut,
        uint256 maxCost,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external payable nonReentrant returns (uint256 cost) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        require(!launched, "campaign launched");
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");
        uint256 costNoFee = _quoteBuyNoFee(amountOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total <= maxCost, "slippage");
        require(msg.value >= total, "insufficient value");

        totalBuyVolumeWei += costNoFee;
        if (!hasBought[msg.sender]) {
            hasBought[msg.sender] = true;
            buyersCount += 1;
        }

        sold += amountOut;
        tokenInterface.safeTransfer(msg.sender, amountOut);

        if (fee > 0) {
            _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, costNoFee, routeProfile);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, msg.sender);
        }

        emit TokensPurchased(msg.sender, amountOut, total);
        return total;
    }

    /// @notice Buy as many tokens as possible for the exact msg.value provided (incl. protocol fee).
    /// @param minTokensOut Minimum acceptable tokens (slippage protection).
    function buyExactBnb(uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut, uint256 totalSpent)
    {
        require(!launched, "campaign launched");
        (tokensOut, totalSpent, ) = quoteBuyExactBnb(msg.value);
        require(tokensOut > 0, "zero amount");
        require(tokensOut >= minTokensOut, "slippage");
        require(sold + tokensOut <= curveSupply, "sold out");

        uint256 costNoFee = _quoteBuyNoFee(tokensOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total == totalSpent, "quote mismatch");

        // Phase 2 counters (volume excludes protocol fee)
        totalBuyVolumeWei += costNoFee;
        if (!hasBought[msg.sender]) {
            hasBought[msg.sender] = true;
            buyersCount += 1;
        }

        sold += tokensOut;
        tokenInterface.safeTransfer(msg.sender, tokensOut);

        if (fee > 0) {
            _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        // Auto-finalize (graduate) immediately once eligible.
        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, msg.sender);
        }

        emit TokensPurchased(msg.sender, tokensOut, total);
        return (tokensOut, total);
    }

    function buyExactBnbAuthorized(
        uint256 minTokensOut,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external payable nonReentrant returns (uint256 tokensOut, uint256 totalSpent) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        require(!launched, "campaign launched");
        (tokensOut, totalSpent, ) = quoteBuyExactBnb(msg.value);
        require(tokensOut > 0, "zero amount");
        require(tokensOut >= minTokensOut, "slippage");
        require(sold + tokensOut <= curveSupply, "sold out");

        uint256 costNoFee = _quoteBuyNoFee(tokensOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total == totalSpent, "quote mismatch");

        totalBuyVolumeWei += costNoFee;
        if (!hasBought[msg.sender]) {
            hasBought[msg.sender] = true;
            buyersCount += 1;
        }

        sold += tokensOut;
        tokenInterface.safeTransfer(msg.sender, tokensOut);

        if (fee > 0) {
            _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, costNoFee, routeProfile);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, msg.sender);
        }

        emit TokensPurchased(msg.sender, tokensOut, total);
        return (tokensOut, total);
    }

    /// @dev Factory-only helper to do an optional initial buy in the same tx as campaign creation.
    /// Emits the same event shape but attributes the trade to `recipient`.
    function buyExactTokensFor(address recipient, uint256 amountOut, uint256 maxCost)
        external
        payable
        onlyFactory
        nonReentrant
        returns (uint256 total)
    {
        require(recipient != address(0), "zero recipient");
        require(!launched, "campaign launched");
        require(amountOut > 0, "zero amount");
        require(sold + amountOut <= curveSupply, "sold out");

        uint256 costNoFee = _quoteBuyNoFee(amountOut);
        uint256 fee = _fee(costNoFee);
        total = costNoFee + fee;
        require(total <= maxCost, "slippage");
        require(msg.value >= total, "insufficient value");

        // Phase 2 counters (volume excludes protocol fee)
        totalBuyVolumeWei += costNoFee;
        if (!hasBought[recipient]) {
            hasBought[recipient] = true;
            buyersCount += 1;
        }

        sold += amountOut;
        tokenInterface.safeTransfer(recipient, amountOut);

        if (fee > 0) {
            _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        // Auto-finalize (graduate) immediately once eligible (factory initial buy can trigger this too).
        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, recipient);
        }

        emit TokensPurchased(recipient, amountOut, total);
        return total;
    }

    /// @dev Factory-only helper to do an optional initial buy with exact BNB in the same tx as campaign creation.
    /// Attributes the trade to `recipient`.
    function buyExactBnbFor(address recipient, uint256 minTokensOut)
        external
        payable
        onlyFactory
        nonReentrant
        returns (uint256 tokensOut, uint256 totalSpent)
    {
        require(recipient != address(0), "zero recipient");
        require(!launched, "campaign launched");

        (tokensOut, totalSpent, ) = quoteBuyExactBnb(msg.value);
        require(tokensOut > 0, "zero amount");
        require(tokensOut >= minTokensOut, "slippage");
        require(sold + tokensOut <= curveSupply, "sold out");

        uint256 costNoFee = _quoteBuyNoFee(tokensOut);
        uint256 fee = _fee(costNoFee);
        uint256 total = costNoFee + fee;
        require(total == totalSpent, "quote mismatch");

        // Phase 2 counters (volume excludes protocol fee)
        totalBuyVolumeWei += costNoFee;
        if (!hasBought[recipient]) {
            hasBought[recipient] = true;
            buyersCount += 1;
        }

        sold += tokensOut;
        tokenInterface.safeTransfer(recipient, tokensOut);

        if (fee > 0) {
            _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, costNoFee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        // Auto-finalize (graduate) immediately once eligible.
        if (sold == curveSupply || _availableNativeBalance() >= graduationTarget) {
            _finalize(0, 0, recipient);
        }

        emit TokensPurchased(recipient, tokensOut, total);
        return (tokensOut, total);
    }

    function sellExactTokens(uint256 amountIn, uint256 minPayout)
        external
        nonReentrant
        returns (uint256 payout)
    {
        require(!launched, "campaign launched");
        require(amountIn > 0, "zero amount");
        require(amountIn <= sold, "exceeds sold");
        uint256 gross = _quoteSellNoFee(amountIn);
        require(gross <= _availableNativeBalance(), "insolvent");
        uint256 fee = _fee(gross);
        payout = gross - fee; // net to seller
        require(payout >= minPayout, "slippage");

        sold -= amountIn;
        tokenInterface.safeTransferFrom(msg.sender, address(this), amountIn);

        if (fee > 0) {
            _routeFeeOrSendLegacy(fee, ROUTE_KIND_TRADE, gross);
        }
        _sendNative(msg.sender, payout);

        // Phase 2 counters (volume excludes protocol fee)
        totalSellVolumeWei += gross;

        emit TokensSold(msg.sender, amountIn, payout);
        return payout;
    }

    function sellExactTokensAuthorized(
        uint256 amountIn,
        uint256 minPayout,
        uint8 routeProfile,
        uint64 routeDeadline,
        bytes calldata routeSignature
    ) external nonReentrant returns (uint256 payout) {
        _verifyTradeRouteAuthorization(msg.sender, routeProfile, routeDeadline, routeSignature);
        require(!launched, "campaign launched");
        require(amountIn > 0, "zero amount");
        require(amountIn <= sold, "exceeds sold");
        uint256 gross = _quoteSellNoFee(amountIn);
        require(gross <= _availableNativeBalance(), "insolvent");
        uint256 fee = _fee(gross);
        payout = gross - fee; // net to seller
        require(payout >= minPayout, "slippage");

        sold -= amountIn;
        tokenInterface.safeTransferFrom(msg.sender, address(this), amountIn);

        if (fee > 0) {
            _routeFeeOrSendLegacyWithProfile(fee, ROUTE_KIND_TRADE, gross, routeProfile);
        }
        _sendNative(msg.sender, payout);

        totalSellVolumeWei += gross;

        emit TokensSold(msg.sender, amountIn, payout);
        return payout;
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

    /// @notice Creator-controlled manual finalize (emergency/backstop only).
    /// @dev Normal flow auto-finalizes inside the completion buy transaction.
    function finalize(uint256 minTokens, uint256 minBnb)
        external
        onlyOwner
        nonReentrant
        returns (uint256 usedTokens, uint256 usedBnb)
    {
        return _finalize(minTokens, minBnb, msg.sender);
    }

    function _finalize(uint256 minTokens, uint256 minBnb, address caller)
        internal
        returns (uint256 usedTokens, uint256 usedBnb)
    {
        require(!launched, "finalized");
        require(
            sold == curveSupply || _availableNativeBalance() >= graduationTarget,
            "threshold"
        );
        launched = true;
        finalizedAt = block.timestamp;

        // Take protocol fee from the total raised BNB BEFORE creating liquidity.
        // This ensures the fee is taken from the full raise (and therefore affects both
        // LP funding and creator payout proportionally).
        uint256 balanceBefore = _availableNativeBalance();
        uint256 protocolFee = (balanceBefore * protocolFeeBps) / MAX_BPS;
        if (protocolFee > 0 && feeRecipient != address(0)) {
            _routeFeeOrSendLegacy(protocolFee, ROUTE_KIND_FINALIZE, balanceBefore);
        }

        uint256 remainingAfterFee = _availableNativeBalance();
        uint256 liquidityValue = (remainingAfterFee * liquidityBps) / MAX_BPS;
        uint256 tokensForLp = liquiditySupply;

        if (tokensForLp > 0 && liquidityValue > 0) {

            // NOTE: We intentionally do NOT revert if the v2 pair already exists or even has reserves.
            // LaunchToken blocks user transfers pre-finalize, so meaningful preseeding should be impossible.
            // Reverting here can brick campaigns, which is worse than any theoretical edge case.

            tokenInterface.forceApprove(address(router), tokensForLp);
            (usedTokens, usedBnb, ) = router.addLiquidityETH{value: liquidityValue}(
                address(token),
                tokensForLp,
                minTokens,
                minBnb,
                lpReceiver,
                block.timestamp + 30 minutes
            );
            tokenInterface.forceApprove(address(router), 0);
            if (tokensForLp > usedTokens) {
                tokenInterface.safeTransfer(owner(), tokensForLp - usedTokens);
            }
        }

        uint256 unsold = curveSupply - sold;
        if (unsold > 0) {
            token.burn(address(this), unsold);
        }

        if (creatorReserve > 0) {
            tokenInterface.safeTransfer(owner(), creatorReserve);
        }

        // Whatever BNB remains after LP provision (and any LP budget refund) goes to the creator.
        uint256 creatorPayout = _availableNativeBalance();
        if (creatorPayout > 0) {
            _sendNative(owner(), creatorPayout);
        }

        // Enable unrestricted token transfers after liquidity is added and funds are distributed
        token.enableTrading();

        emit CampaignFinalized(
            caller,
            usedTokens,
            usedBnb,
            protocolFee,
            creatorPayout
        );
    }

    /// @dev Integral of the bonding curve from 0..x gives cumulative cost in wei.
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
        if (reserved >= balance) {
            return 0;
        }
        return balance - reserved;
    }

    function _sendNative(address to, uint256 value) private {
        if (value == 0) return;
        (bool success, ) = to.call{value: value}("");
        require(success, "transfer failed");
    }
}
