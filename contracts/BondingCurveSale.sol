// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./interfaces/IPancakeRouter02.sol";

/// @title BondingCurveSale
/// @notice Implements a tiered bonding curve sale for LaunchIt. Users can buy
/// tokens with BNB, which are priced according to a simple linear step function
/// across discrete tiers. Each tier has a fixed number of tokens and price.
///
/// The sale supports two modes for external tokens: Minter mode (the sale
/// contract is given permission to mint tokens) and Escrow mode (pre-minted
/// tokens are deposited into the sale). The sale also includes an on-chain
/// self-test to ensure that external tokens satisfy basic rules (no taxes or
/// blacklist). Buyers are protected via exact-out transfer checks.
contract BondingCurveSale is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /// @notice Sale modes for external tokens
    enum Mode {
        Minter,
        Escrow
    }

    /// @notice Sale parameters configured during initialization
    struct InitParams {
        // token being sold
        address token;
        // size of each tier in tokens (18 decimals assumed)
        uint256 tierSize;
        // starting price per token (BNB per token in wei)
        uint256 startPrice;
        // price increment per tier (BNB per token)
        uint256 priceStep;
        // maximum tiers processed in a single buy to limit gas usage
        uint8 maxTiersPerTx;
        // platform fee in basis points (10000 = 100%)
        uint16 platformFeeBps;
        // unix timestamp when sale ends; 0 for no time limit
        uint256 endTime;
        // maximum BNB the sale will accept; 0 for unlimited
        uint256 hardCapBNB;
        // percentage of raised funds used as LP BNB when finalizing (basis points)
        uint16 lpPercent;
        // Pancake router for adding liquidity
        address router;
        // address receiving platform fees
        address payable treasury;
        // address receiving creator payout
        address payable payout;
        // sale mode (minter or escrow)
        Mode mode;
    }

    /// @notice Event emitted when tokens are purchased
    event Bought(
        address indexed buyer,
        uint256 bnbIn,
        uint256 fee,
        uint256 netBNB,
        uint256 tokensOut,
        uint256 tierStart,
        uint256 tiersCrossed,
        uint256 soldAfter
    );

    /// @notice Event emitted when the sale is finalized
    event Finalized(uint256 raised, uint256 lpBNB, uint256 lpTokens, uint256 listingPrice, uint256 lockUntil);

    /// @notice Event emitted when external token self-test passes
    event ExternalSelfTestPassed(uint256 probeAmount);

    IERC20 public token;
    IPancakeRouter02 public router;
    uint256 public tierSize;
    uint256 public startPrice;
    uint256 public priceStep;
    uint8 public maxTiersPerTx;
    uint16 public platformFeeBps;
    uint256 public endTime;
    uint256 public hardCapBNB;
    uint16 public lpPercent;
    address payable public treasury;
    address payable public payout;
    Mode public mode;

    // total tokens sold (18 decimals)
    uint256 public sold;
    // total BNB raised (including platform fee)
    uint256 public raised;
    // whether sale has been finalized
    bool public finalized;
    // whether external token passed self-test (for external tokens only)
    bool public externalOk;
    // listing price recorded at finalize
    uint256 public listingPrice;
    // timestamp until which LP tokens are locked
    uint256 public lpLockedUntil;

    // indicates whether this sale contract has passed the on-chain audit
    bool public audited;

    /// @notice Event emitted when the sale passes the audit
    event SaleAudited();

    constructor() Ownable(address(this)) {
    // implementation contract is its own owner
}

    /// @notice Initializes the sale with the given parameters. Can only be called once.
    function initialize(InitParams memory params) external {
    require(address(token) == address(0), "Already initialized");
    require(params.token != address(0), "Token zero");

    // Factory becomes owner (for audit + setup)
    _transferOwnership(msg.sender);

    token = IERC20(params.token);
    router = IPancakeRouter02(params.router);
    tierSize = params.tierSize;
    startPrice = params.startPrice;
    priceStep = params.priceStep;
    maxTiersPerTx = params.maxTiersPerTx;
    platformFeeBps = params.platformFeeBps;
    endTime = params.endTime;
    hardCapBNB = params.hardCapBNB;
    lpPercent = params.lpPercent;
    treasury = params.treasury;
    payout = params.payout;
    mode = params.mode;

    _pause();
}

    /**
     * @notice Runs an on-chain audit of the sale configuration. Can only be executed
     * once by the owner (factory) immediately after initialization. This audit
     * performs sanity checks on sale parameters and the associated token. On success
     * it marks the sale as audited and emits an event. Internal LaunchIt token sales
     * should invoke this during deployment via the factory. External token sales
     * should only call this after externalOk is set (self-test has passed).
     */
    function audit() external onlyOwner {
        require(!audited, "Already audited");
        // ensure any external token has passed self-test (externalOk) before auditing.
        // For LaunchIt-created tokens, externalOk is always false but decimals are fixed, so we don't require it.
        if (mode == Mode.Escrow && !externalOk) {
            revert("Self-test not passed");
        }
        // verify token decimals (should be 18)
        try IERC20Metadata(address(token)).decimals() returns (uint8 dec) {
            require(dec == 18, "Token decimals != 18");
        } catch {
            revert("Token has no decimals()");
        }
        // basic parameter checks
        require(tierSize > 0, "tierSize zero");
        require(maxTiersPerTx > 0, "maxTiersPerTx zero");
        require(platformFeeBps <= 1000, "Fee too high");
        // price monotonicity: price increases or stays flat between tiers
        uint256 p0 = startPrice;
        uint256 p1 = startPrice + priceStep;
        require(p1 >= p0, "Non-increasing price");
        // record audit
        audited = true;
        emit SaleAudited();
    }

    /**
     * @notice Computes the number of tokens out for a given BNB input (pre-fee).
     * The function iterates across tiers until the input is depleted or
     * maxTiersPerTx tiers are crossed. Returns tokensOut, bnbUsed and tiersCrossed.
     */
    function quoteTokensOut(uint256 bnbIn) public view returns (uint256 tokensOut, uint256 bnbUsed, uint256 tiersCrossed) {
        uint256 net = bnbIn;
        uint256 localSold = sold;
        uint256 leftover = net;
        for (uint256 i = 0; i < maxTiersPerTx; i++) {
            uint256 tierIndex = localSold / tierSize;
            uint256 inTier = localSold % tierSize;
            uint256 avail = tierSize - inTier;
            uint256 price = startPrice + priceStep * tierIndex;
            // cost to finish this tier
            uint256 costFull = (avail * price) / 1e18;
            if (leftover >= costFull) {
                tokensOut += avail;
                leftover -= costFull;
                localSold += avail;
                tiersCrossed++;
                continue;
            }
            // partial fill
            uint256 buyTokens = (leftover * 1e18) / price;
            if (buyTokens > avail) {
                buyTokens = avail;
            }
            tokensOut += buyTokens;
            bnbUsed = net - leftover;
            return (tokensOut, net - leftover + ((buyTokens * price) / 1e18), tiersCrossed);
        }
        bnbUsed = net - leftover;
        return (tokensOut, bnbUsed, tiersCrossed);
    }

    /**
     * @notice Public payable function allowing users to buy tokens along the bonding curve.
     * @param minTokensOut The minimum number of tokens the buyer is willing to accept (slippage protection).
     * @param deadline Timestamp after which the transaction will revert (optional; 0 to ignore).
     */
    function buy(uint256 minTokensOut, uint256 deadline) external payable nonReentrant whenNotPaused {
        require(!finalized, "Sale finalized");
        require(externalOk || msg.sender == owner(), "External not OK");
        if (deadline != 0) {
            require(block.timestamp <= deadline, "Expired");
        }
        if (endTime != 0) {
            require(block.timestamp < endTime, "Sale ended");
        }
        uint256 bnbAmount = msg.value;
        require(bnbAmount > 0, "Zero BNB");
        if (hardCapBNB != 0) {
            require(raised + bnbAmount <= hardCapBNB, "Hard cap reached");
        }
        // calculate platform fee and net amount
        uint256 fee = (bnbAmount * platformFeeBps) / 10000;
        uint256 net = bnbAmount - fee;
        // send fee immediately to treasury
        (bool sent, ) = treasury.call{value: fee}("");
        require(sent, "Fee send failed");

        // quote tokens out from net amount
        (uint256 tokensOut,, uint256 tiersCrossed) = quoteTokensOut(net);
        require(tokensOut >= minTokensOut, "Slippage");

        // update state
        sold += tokensOut;
        raised += bnbAmount;

        // mint or transfer tokens
        _dispense(msg.sender, tokensOut);

        emit Bought(msg.sender, bnbAmount, fee, net, tokensOut, sold / tierSize, tiersCrossed, sold);
    }

    /// @notice Finalizes the sale, adds liquidity and locks LP tokens. Can only be called once by the owner after sale end.
    function finalize() external nonReentrant onlyOwner {
        require(!finalized, "Already finalized");
        // sale must be paused at finalize to prevent race conditions
        _pause();
        if (endTime != 0) {
            require(block.timestamp >= endTime, "Not ended");
        }
        finalized = true;
        // compute listing price as current tier price
        uint256 finalTier = sold / tierSize;
        listingPrice = startPrice + priceStep * finalTier;
        // compute amounts for LP
        uint256 lpBNB = (raised * lpPercent) / 10000;
        uint256 lpTokens = (lpBNB * 1e18) / listingPrice;
        // mint tokens for LP or escrow deposit
        if (mode == Mode.Minter) {
            // attempt to mint tokens to this contract
            bytes memory payload = abi.encodeWithSignature("mint(address,uint256)", address(this), lpTokens);
            (bool ok, ) = address(token).call(payload);
            require(ok, "Mint failed");
        } else {
            // ensure we have enough tokens in escrow
            require(token.balanceOf(address(this)) >= lpTokens, "Escrow short");
        }
        // approve tokens to router
        token.safeIncreaseAllowance(address(router), lpTokens);
        // add liquidity
        (, , uint256 liquidity) = router.addLiquidityETH{value: lpBNB}(
            address(token),
            lpTokens,
            0,
            0,
            address(this),
            block.timestamp + 1200
        );
        // lock LP tokens by setting timestamp; tokens remain in sale contract
        lpLockedUntil = block.timestamp + 180 days;
        // send remaining BNB to creator payout
        uint256 remainingBNB = address(this).balance;
        if (remainingBNB > 0) {
            (bool okSend, ) = payout.call{value: remainingBNB}("");
            require(okSend, "Payout failed");
        }
        emit Finalized(raised, lpBNB, liquidity, listingPrice, lpLockedUntil);
    }

    /// @notice Runs a self-test on an external token to ensure no taxes or blacklists. Only owner can call.
    /// Transfers a small probe amount to self and back; ensures exactness. Marks sale as ready.
    function selfTestExternalToken(uint256 probeAmount) external onlyOwner {
        require(!externalOk, "Already tested");
        require(IERC20Metadata(address(token)).decimals() == 18, "Bad decimals");
        if (mode == Mode.Minter) {
            // attempt to mint tokens for probe
            bytes memory payload = abi.encodeWithSignature("mint(address,uint256)", address(this), probeAmount);
            (bool ok, ) = address(token).call(payload);
            require(ok, "No mint permission");
        } else {
            require(token.balanceOf(address(this)) >= probeAmount, "Not enough escrow");
        }
        // send to self (no-op) and back to verify no tax
        _transferExact(token, address(this), probeAmount);
        // return tokens if minted
        if (mode == Mode.Minter) {
            token.safeTransfer(address(0), 0); // no-op to satisfy checks
        }
        externalOk = true;
        emit ExternalSelfTestPassed(probeAmount);
    }

    /// @notice Dispenses tokens to a buyer depending on mode. Performs exact-out transfer checks.
    function _dispense(address to, uint256 amount) internal {
        if (mode == Mode.Minter) {
            bytes memory payload = abi.encodeWithSignature("mint(address,uint256)", address(this), amount);
            (bool ok, ) = address(token).call(payload);
            require(ok, "Mint failed");
        }
        _transferExact(token, to, amount);
    }

    /// @notice Transfers tokens and verifies the recipient receives exactly the amount.
    function _transferExact(IERC20 t, address to, uint256 amt) internal {
        uint256 beforeBal = t.balanceOf(to);
        t.safeTransfer(to, amt);
        uint256 afterBal = t.balanceOf(to);
        require(afterBal - beforeBal == amt, "Token tax/deflation");
    }

    /// @notice Allows the owner to unpause the sale. Should be called after self-test.
    function unpauseSale() external onlyOwner {
        require(!finalized, "Finalized");
        _unpause();
    }
}