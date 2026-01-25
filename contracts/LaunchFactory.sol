// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {LaunchCampaign} from "./LaunchCampaign.sol";

contract LaunchFactory is Ownable {
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
        uint256 initialBuyTokens; // optional: buy tokens for the creator in the create tx
    }

    uint256 private constant MAX_BPS = 10_000;

    LaunchConfig public config;
    address public feeRecipient;
    uint256 public protocolFeeBps;
    address public router;

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

    constructor(address router_) Ownable(msg.sender) {
        require(router_ != address(0), "router zero");
        router = router_;
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
    }

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
        require(bytes(req.name).length > 0, "name");
        require(bytes(req.symbol).length > 0, "symbol");
        require(bytes(req.logoURI).length > 0, "logo uri");

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
            router: router,
            lpReceiver: req.lpReceiver == address(0)
                ? msg.sender
                : req.lpReceiver,
            feeRecipient: feeRecipient,
            creator: msg.sender,
            factory: address(this)
        });

        LaunchCampaign campaign = new LaunchCampaign(params);
        campaignAddr = address(campaign);
        tokenAddr = address(campaign.token());

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
        // Any extra msg.value is refunded.
        uint256 spent = 0;
        if (req.initialBuyTokens > 0) {
            uint256 total = LaunchCampaign(campaignAddr).quoteBuyExactTokens(
                req.initialBuyTokens
            );
            require(msg.value >= total, "INIT_BUY_VALUE");
            LaunchCampaign(campaignAddr).buyExactTokensFor{value: total}(
                msg.sender,
                req.initialBuyTokens,
                total
            );
            spent = total;
        }
        if (msg.value > spent) {
            (bool ok, ) = msg.sender.call{value: msg.value - spent}("");
            require(ok, "REFUND_FAIL");
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
        require(newRouter != address(0), "router zero");
        router = newRouter;
        emit RouterUpdated(newRouter);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "recipient zero");
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function setProtocolFee(uint256 newProtocolFeeBps) external onlyOwner {
        require(newProtocolFeeBps <= 1000, "fee too high");
        protocolFeeBps = newProtocolFeeBps;
        emit ProtocolFeeUpdated(newProtocolFeeBps);
    }

    function campaignsCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaign(uint256 id) external view returns (CampaignInfo memory) {
        require(id < _campaigns.length, "out of bounds");
        return _campaigns[id];
    }

    function getCampaignPage(uint256 offset, uint256 limit)
        external
        view
        returns (CampaignInfo[] memory page)
    {
        require(offset < _campaigns.length || _campaigns.length == 0, "offset");
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
        require(newConfig.totalSupply > 0, "supply zero");
        require(
            newConfig.curveBps > 0 &&
                newConfig.curveBps + newConfig.liquidityTokenBps <= MAX_BPS,
            "invalid curve bps"
        );
        require(newConfig.basePrice > 0, "price zero");
        require(newConfig.priceSlope > 0, "slope zero");
        require(newConfig.graduationTarget > 0, "target zero");
        require(newConfig.liquidityBps <= MAX_BPS, "liquidity bps");
    }
}
