// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {LaunchToken} from "./token/LaunchToken.sol";
import {IPancakeRouter02} from "./interfaces/IPancakeRouter02.sol";

/// @notice Pump.fun inspired bonding curve launch campaign that targets PancakeSwap for final liquidity.
contract LaunchCampaign is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

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
        address router;
        address lpReceiver;
        address feeRecipient;
        address creator;
        address factory;
    }

    uint256 private constant WAD = 1e18;
    uint256 private constant MAX_BPS = 10_000;

    LaunchToken public immutable token;
    IERC20 private immutable tokenInterface;
    IPancakeRouter02 public immutable router;
    address public immutable factory;
    address public immutable feeRecipient;
    address public immutable lpReceiver;

    string public logoURI;
    string public xAccount;
    string public website;
    string public extraLink;

    uint256 public immutable basePrice;
    uint256 public immutable priceSlope;
    uint256 public immutable graduationTarget;
    uint256 public immutable liquidityBps;
    uint256 public immutable protocolFeeBps;

    uint256 public immutable totalSupply;
    uint256 public immutable curveSupply;
    uint256 public immutable liquiditySupply;
    uint256 public immutable creatorReserve;

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

    event TokensPurchased(address indexed buyer, uint256 amountOut, uint256 cost);
    event TokensSold(address indexed seller, uint256 amountIn, uint256 payout);
    event CampaignFinalized(
        address indexed caller,
        uint256 liquidityTokens,
        uint256 liquidityBnb,
        uint256 protocolFee,
        uint256 creatorPayout
    );

    constructor(InitParams memory params) Ownable(params.creator) {
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
        require(bytes(params.logoURI).length > 0, "logo uri");

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
        lpReceiver = params.lpReceiver == address(0)
            ? params.creator
            : params.lpReceiver;
        router = IPancakeRouter02(params.router);

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
            _sendNative(feeRecipient, fee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        emit TokensPurchased(msg.sender, amountOut, total);
        return total;
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
            _sendNative(feeRecipient, fee);
        }

        if (msg.value > total) {
            _sendNative(msg.sender, msg.value - total);
        }

        emit TokensPurchased(recipient, amountOut, total);
        return total;
    }

    function sellExactTokens(uint256 amountIn, uint256 minPayout)
        external
        nonReentrant
        returns (uint256 payout)
    {
        require(!launched, "campaign launched");
        uint256 gross = _quoteSellNoFee(amountIn);
        uint256 fee = _fee(gross);
        payout = gross - fee; // net to seller
        require(payout >= minPayout, "slippage");

        sold -= amountIn;
        tokenInterface.safeTransferFrom(msg.sender, address(this), amountIn);

        if (fee > 0) {
            _sendNative(feeRecipient, fee);
        }
        _sendNative(msg.sender, payout);

        // Phase 2 counters (volume excludes protocol fee)
        totalSellVolumeWei += gross;

        emit TokensSold(msg.sender, amountIn, payout);
        return payout;
    }

    function finalize(uint256 minTokens, uint256 minBnb)
        external
        onlyOwner
        nonReentrant
        returns (uint256 usedTokens, uint256 usedBnb)
    {
        require(!launched, "finalized");
        require(
            sold == curveSupply || address(this).balance >= graduationTarget,
            "threshold"
        );
        launched = true;
        finalizedAt = block.timestamp;

        // Take protocol fee from the total raised BNB BEFORE creating liquidity.
        // This ensures the fee is taken from the full raise (and therefore affects both
        // LP funding and creator payout proportionally).
        uint256 balanceBefore = address(this).balance;
        uint256 protocolFee = (balanceBefore * protocolFeeBps) / MAX_BPS;
        if (protocolFee > 0 && feeRecipient != address(0)) {
            _sendNative(feeRecipient, protocolFee);
        }

        // Bonding-curve fees apply only pre-launch. Once liquidity is seeded on the DEX,
        // this campaign no longer executes trades and the protocol fee should be considered off.
        // (Also protects against any future code-paths that might read protocolFeeBps post-launch.)
        protocolFeeBps = 0;

        uint256 remainingAfterFee = address(this).balance;
        uint256 liquidityValue = (remainingAfterFee * liquidityBps) / MAX_BPS;
        uint256 tokensForLp = liquiditySupply;

        if (tokensForLp > 0 && liquidityValue > 0) {
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
        uint256 creatorPayout = address(this).balance;
        if (creatorPayout > 0) {
            _sendNative(owner(), creatorPayout);
        }

        // Enable unrestricted token transfers after liquidity is added and funds are distributed
        token.enableTrading();

        emit CampaignFinalized(
            msg.sender,
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

    function _sendNative(address to, uint256 value) private {
        (bool success, ) = to.call{value: value}("");
        require(success, "transfer failed");
    }
}
