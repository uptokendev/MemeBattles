// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {LaunchCampaign} from "./LaunchCampaign.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract LaunchFactory is Ownable {
    // Custom errors to reduce deployed bytecode size (BSC testnet enforces the 24KB limit).
    error RouterZero();
    error NameEmpty();
    error SymbolEmpty();
    error LogoEmpty();
    error InitBuyValue();
    error InitBuyTooLarge();
    error RefundFail();
    error RecipientZero();
    error FeeTooHigh();
    error FeeTooLowForLeague();
    error ParamTooHigh();
    error OutOfBounds();
    error Offset();
    error SupplyZero();
    error InvalidCurveBps();
    error PriceZero();
    error SlopeZero();
    error TargetZero();
    error LiquidityBps();
    error NotLive();
    error AlreadyLive();
    struct LaunchConfig {
        uint256 totalSupply;
        uint256 curveBps;
        uint256 liquidityTokenBps;
        uint256 basePrice;
        uint256 priceSlope;
        uint256 graduationTarget;
        uint256 liquidityBps;
    }

    struct CampaignInfo {
        address campaign;
        address token;
        address creator;
        string name;
        string symbol;
        string logoURI;
        string xAccount;
        string website;
        string extraLink;
        uint64 createdAt;
    }

    struct CampaignRequest {
        string name;
        string symbol;
        string logoURI;
        string xAccount;
        string website;
        string extraLink;
        uint256 basePrice;
        uint256 priceSlope;
        uint256 graduationTarget;
        address lpReceiver;
        uint256 initialBuyBnbWei; // optional: buy tokens for the creator using exact BNB in the create tx
    }

    uint256 private constant MAX_BPS = 10_000;
    uint256 private constant MAX_CREATOR_INIT_BUY = 1 ether;

    LaunchConfig public config;
    address public feeRecipient;
    uint256 public protocolFeeBps;

    /// @notice One-way latch. Default is Prepare Mode (live = false). Once enabled, it can never be disabled.
    bool public live;
    uint256 public constant LEAGUE_FEE_BPS = 75;
    uint256 public constant MAX_BASE_PRICE = 1_000 ether;
    uint256 public constant MAX_PRICE_SLOPE = 1e36;
    uint256 public constant MAX_GRADUATION_TARGET = 1_000_000 ether;
    // Burn address for LP tokens. LP minted here can never be redeemed.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address public immutable leagueReceiver;
    address public router;
    address public campaignImplementation;

    CampaignInfo[] private _campaigns;

    event CampaignCreated(
        uint256 indexed id,
        address indexed campaign,
        address indexed token,
        address creator,
        string name,
        string symbol
    );
    event ConfigUpdated(LaunchConfig newConfig);
    event FeeRecipientUpdated(address indexed newRecipient);
    event RouterUpdated(address indexed newRouter);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event LiveEnabled(uint64 at);

    constructor(address router_, address leagueReceiver_) Ownable(msg.sender) {
        if (router_ == address(0)) revert RouterZero();
        if (leagueReceiver_ == address(0)) revert RecipientZero();
        router = router_;
        leagueReceiver = leagueReceiver_;
        config = LaunchConfig({
            totalSupply: 1_000_000_000 ether,
            curveBps: 8800,
            liquidityTokenBps: 1000,
            basePrice: 5e13, // 0.00005 BNB
            priceSlope: 1e9, // grows 1 gwei per token sold (scaled to 1e18)
            graduationTarget: 50 ether,
            // 80% of raised BNB (after protocol fee) goes to LP, 20% to the creator.
            liquidityBps: 8000
        });
        feeRecipient = msg.sender;
        // 2% fee on bonding-curve buys/sells, and 2% taken again at finalize before LP.
        protocolFeeBps = 200;
        // Deploy the campaign implementation once; campaigns are cheap EIP-1167 clones.
        campaignImplementation = address(new LaunchCampaign());
    }

    /// @notice Enables Live Mode permanently. Cannot be undone.
    function enableLive() external onlyOwner {
        if (live) revert AlreadyLive();
        live = true;
        emit LiveEnabled(uint64(block.timestamp));
    }


    receive() external payable {}

    /// @notice Quotes the BNB value required to perform the optional initial buy during createCampaign.
    /// @dev Assumes sold == 0 for the newly created campaign.
    function quoteInitialBuyTotal(
        uint256 initialBuyTokens,
        uint256 basePriceOverride,
        uint256 priceSlopeOverride
    ) external view returns (uint256) {
        if (initialBuyTokens == 0) return 0;
        uint256 base = basePriceOverride > 0 ? basePriceOverride : config.basePrice;
        uint256 slope = priceSlopeOverride > 0 ? priceSlopeOverride : config.priceSlope;

        // Matches LaunchCampaign._area() for sold == 0
        uint256 term1 = (base * initialBuyTokens) / 1e18;
        uint256 term2 = (slope * initialBuyTokens * initialBuyTokens) / (2 * 1e18 * 1e18);
        uint256 costNoFee = term1 + term2;
        uint256 fee = (costNoFee * protocolFeeBps) / 10000;
        return costNoFee + fee;
    }

    function createCampaign(CampaignRequest calldata req)
        external
        payable
        returns (address campaignAddr, address tokenAddr)
    {
        if (!live) revert NotLive();
        if (bytes(req.name).length == 0) revert NameEmpty();
        if (bytes(req.symbol).length == 0) revert SymbolEmpty();
        if (bytes(req.logoURI).length == 0) revert LogoEmpty();

if (req.basePrice != 0 && req.basePrice > MAX_BASE_PRICE) revert ParamTooHigh();
if (req.priceSlope != 0 && req.priceSlope > MAX_PRICE_SLOPE) revert ParamTooHigh();
if (req.graduationTarget != 0 && req.graduationTarget > MAX_GRADUATION_TARGET) revert ParamTooHigh();


        LaunchCampaign.InitParams memory params = LaunchCampaign.InitParams({
            name: req.name,
            symbol: req.symbol,
            logoURI: req.logoURI,
            xAccount: req.xAccount,
            website: req.website,
            extraLink: req.extraLink,
            totalSupply: config.totalSupply,
            curveBps: config.curveBps,
            liquidityTokenBps: config.liquidityTokenBps,
            basePrice: req.basePrice == 0 ? config.basePrice : req.basePrice,
            priceSlope: req.priceSlope == 0 ? config.priceSlope : req.priceSlope,
            graduationTarget: req.graduationTarget == 0
                ? config.graduationTarget
                : req.graduationTarget,
            liquidityBps: config.liquidityBps,
            protocolFeeBps: protocolFeeBps,
            leagueFeeBps: LEAGUE_FEE_BPS,
            leagueReceiver: leagueReceiver,
            router: router,
            // Force LP to be burned for every campaign.
            // We intentionally ignore any user-provided lpReceiver.
            lpReceiver: DEAD,
            feeRecipient: feeRecipient,
            creator: msg.sender,
            factory: address(this)
        });

        address clone = Clones.clone(campaignImplementation);
        LaunchCampaign(payable(clone)).initialize(params);
        campaignAddr = clone;
        tokenAddr = address(LaunchCampaign(payable(clone)).token());

        _campaigns.push(
            CampaignInfo({
                campaign: campaignAddr,
                token: tokenAddr,
                creator: msg.sender,
                name: req.name,
                symbol: req.symbol,
                logoURI: req.logoURI,
                xAccount: req.xAccount,
                website: req.website,
                extraLink: req.extraLink,
                createdAt: uint64(block.timestamp)
            })
        );

        // Optional initial buy for the creator, executed within the same transaction.
        // Creator specifies exact BNB to spend (req.initialBuyBnbWei). Any extra msg.value is refunded.
        uint256 spent = 0;
        if (req.initialBuyBnbWei > 0) {
    if (req.initialBuyBnbWei > MAX_CREATOR_INIT_BUY) revert InitBuyTooLarge();
    if (msg.value < req.initialBuyBnbWei) revert InitBuyValue();

    (, uint256 totalSpent) = LaunchCampaign(payable(campaignAddr)).buyExactBnbFor{value: req.initialBuyBnbWei}(
        msg.sender,
        0
    );
    spent = totalSpent;
}
        if (msg.value > spent) {
            (bool ok, ) = msg.sender.call{value: msg.value - spent}("");
            if (!ok) revert RefundFail();
        }

        emit CampaignCreated(
            _campaigns.length - 1,
            campaignAddr,
            tokenAddr,
            msg.sender,
            req.name,
            req.symbol
        );
    }

    function setConfig(LaunchConfig calldata newConfig) external onlyOwner {
        _validateConfig(newConfig);
        config = newConfig;
        emit ConfigUpdated(newConfig);
    }

    function setRouter(address newRouter) external onlyOwner {
        if (newRouter == address(0)) revert RouterZero();
        router = newRouter;
        emit RouterUpdated(newRouter);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert RecipientZero();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function setProtocolFee(uint256 newProtocolFeeBps) external onlyOwner {
        if (newProtocolFeeBps > 1000) revert FeeTooHigh();
        if (newProtocolFeeBps < LEAGUE_FEE_BPS) revert FeeTooLowForLeague();
        protocolFeeBps = newProtocolFeeBps;
        emit ProtocolFeeUpdated(newProtocolFeeBps);
    }

    function campaignsCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaign(uint256 id) external view returns (CampaignInfo memory) {
        if (id >= _campaigns.length) revert OutOfBounds();
        return _campaigns[id];
    }

    function getCampaignPage(uint256 offset, uint256 limit)
        external
        view
        returns (CampaignInfo[] memory page)
    {
        if (!(_campaigns.length == 0 || offset < _campaigns.length)) revert Offset();
        if (_campaigns.length == 0 || limit == 0) {
            return new CampaignInfo[](0);
        }
        uint256 end = offset + limit;
        if (end > _campaigns.length) {
            end = _campaigns.length;
        }
        uint256 size = end > offset ? end - offset : 0;
        page = new CampaignInfo[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _campaigns[offset + i];
        }
    }

    function _validateConfig(LaunchConfig memory newConfig) internal pure {
        if (newConfig.totalSupply == 0) revert SupplyZero();
        if (!(newConfig.curveBps > 0 && newConfig.curveBps + newConfig.liquidityTokenBps <= MAX_BPS)) revert InvalidCurveBps();
        if (newConfig.basePrice == 0) revert PriceZero();
        if (newConfig.basePrice > MAX_BASE_PRICE) revert ParamTooHigh();
        if (newConfig.priceSlope == 0) revert SlopeZero();
        if (newConfig.priceSlope > MAX_PRICE_SLOPE) revert ParamTooHigh();
        if (newConfig.graduationTarget == 0) revert TargetZero();
        if (newConfig.graduationTarget > MAX_GRADUATION_TARGET) revert ParamTooHigh();
        if (newConfig.liquidityBps > MAX_BPS) revert LiquidityBps();
    }
}
