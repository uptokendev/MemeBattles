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
    error CooldownActive();
    error MaxLiveCampaignsReached();
    error NotRegistered();
    error PremiumTierRequired();
    error InvalidTier();
    error LengthMismatch();
    error AlreadyFinalized();
    error AbandonTooEarly();
    error TreasuryTransferFail();
    error InvalidTierConfig();
    error AntiVampLocked();
    struct LaunchConfig {
        uint256 totalSupply;
        uint256 curveBps;
        uint256 liquidityTokenBps;
        uint256 basePrice;
        uint256 priceSlope;
        uint256 graduationTarget;
        uint256 liquidityBps;
    }

    /// @notice Tier configuration. cooldownSeconds is the per-deploy-slot
    /// cooldown — each of the `deploySlots` slots tracks its own timer
    /// independently. maxLiveCampaigns caps concurrent active campaigns.
    struct TierConfig {
        uint256 cooldownSeconds;
        uint8   deploySlots;
        uint8   maxLiveCampaigns;
        uint256 creatorNoSellBlocks;
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
        // Premium-mode fields (0/false = disabled, tier >= Premium required)
        uint256 firstMinWalletCapWei;
        bool    antiBotEnabled;
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
    /// @notice Cap on totalSupply to keep x*x in LaunchCampaign._area within
    /// uint256 even inside the unchecked block. 1e30 wei (1 trillion 18-decimal
    /// tokens) bounds x*x at ~1e60 — far below uint256 max ~1.16e77 — and is
    /// well above any realistic meme launch (Ackee L4 / W10 mitigation).
    uint256 public constant MAX_TOTAL_SUPPLY = 1e30;
    // Bounds on TierConfig fields to prevent admin-key compromise from
    // DoSing creation, freezing creator activity, or OOGing the slot loop
    // (Salus four.meme Finding 5 equivalent).
    uint256 public constant MAX_COOLDOWN = 7 days;
    uint8   public constant MAX_DEPLOY_SLOTS = 10;
    uint8   public constant MAX_LIVE_CAMPAIGNS_BOUND = 20;
    uint256 public constant MAX_NO_SELL_BLOCKS = 100_000; // ~3.5 days at 3s blocks
    /// @notice Upper bound on the configurable anti-vamp lockout. 30 days is
    /// far longer than any realistic protection window; bounded to prevent
    /// admin-key compromise from permanently freezing creation under a given
    /// (symbol, logoURI) hash.
    uint256 public constant MAX_ANTI_VAMP_LOCKOUT = 30 days;
    // Burn address for LP tokens. LP minted here can never be redeemed.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address public immutable leagueReceiver;
    address public router;
    address public campaignImplementation;

    CampaignInfo[] private _campaigns;

    // ── Protection Framework ──
    mapping(address => uint8) public creatorTier;          // 0=Base, 1=Premium, 2=Verified
    mapping(uint8 => TierConfig) public tierConfig;
    /// @notice Per-creator, per-deploy-slot timestamp of last use. A slot is
    /// "free" when its last-use timestamp is older than cooldownSeconds ago.
    /// Slot count is determined by the creator's tier config.
    mapping(address => mapping(uint8 => uint64)) public deploySlotLastUsed;
    mapping(address => uint8) public activeCampaignCount;
    mapping(address => bool) public isRegisteredCampaign;

    /// @notice How long a campaign can be inactive before anyone can call abandonCampaign.
    uint256 public abandonTimeout = 30 days;

    /// @notice Anti-vamp lockout duration. After a campaign is created with a
    /// given (symbol, logoURI), no new campaign with the same combo can be
    /// created for this many seconds. Default 48h, owner-tunable up to MAX.
    uint256 public antiVampLockout = 48 hours;
    mapping(bytes32 => uint64) public symbolLogoLockedUntil;

    /// @notice Global kill switch for buys across every campaign. Sells stay
    /// open so holders always have an exit. Modeled on Pump.fun's
    /// disable_flags pattern — useful for incident response without
    /// iterating every campaign.
    bool public globalPauseBuys;

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
    event TierConfigUpdated(uint8 indexed tier, TierConfig config);
    event CreatorTierUpdated(address indexed creator, uint8 tier);
    event CampaignAbandoned(address indexed creator, address indexed campaign);
    event AbandonTimeoutUpdated(uint256 newTimeout);
    event AntiVampLockoutUpdated(uint256 newLockout);
    event GlobalPauseBuysSet(bool paused);

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

        // ── Anti-vamp: block re-use of (symbol, logoURI) within lockout ──
        bytes32 vampKey = keccak256(abi.encodePacked(req.symbol, req.logoURI));
        if (block.timestamp < symbolLogoLockedUntil[vampKey]) revert AntiVampLocked();
        symbolLogoLockedUntil[vampKey] = uint64(block.timestamp + antiVampLockout);

        // ── Tier enforcement ──
        TierConfig memory tc = tierConfig[creatorTier[msg.sender]];

        // 1) Per-slot cooldown rate limit. Each of `deploySlots` slots tracks
        //    its own timer; a slot is free when its last-use timestamp is
        //    older than cooldownSeconds. Disabled if either is zero.
        if (tc.deploySlots > 0 && tc.cooldownSeconds > 0) {
            uint64 cutoff = block.timestamp > tc.cooldownSeconds
                ? uint64(block.timestamp - tc.cooldownSeconds)
                : 0;
            uint8 freeSlot = type(uint8).max;
            for (uint8 i = 0; i < tc.deploySlots; i++) {
                if (deploySlotLastUsed[msg.sender][i] <= cutoff) {
                    freeSlot = i;
                    break;
                }
            }
            if (freeSlot == type(uint8).max) revert CooldownActive();
            deploySlotLastUsed[msg.sender][freeSlot] = uint64(block.timestamp);
        }

        // 2) Concurrent active campaign cap (independent of deploy slots).
        if (tc.maxLiveCampaigns > 0
            && activeCampaignCount[msg.sender] >= tc.maxLiveCampaigns) {
            revert MaxLiveCampaignsReached();
        }

        // 3) Premium-mode tier gate.
        if (req.firstMinWalletCapWei > 0 || req.antiBotEnabled) {
            if (creatorTier[msg.sender] < 1) revert PremiumTierRequired();
        }

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
            factory: address(this),
            creatorNoSellBlocks: tc.creatorNoSellBlocks,
            firstMinWalletCapWei: req.firstMinWalletCapWei,
            antiBotEnabled: req.antiBotEnabled
        });

        address clone = Clones.clone(campaignImplementation);
        LaunchCampaign(payable(clone)).initialize(params);
        campaignAddr = clone;
        tokenAddr = address(LaunchCampaign(payable(clone)).token());

        // Track protection state
        isRegisteredCampaign[campaignAddr] = true;
        activeCampaignCount[msg.sender]++;

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

    // ── Tier Management (owner only) ──

    function setTierConfig(uint8 tier, TierConfig calldata cfg) external onlyOwner {
        if (cfg.cooldownSeconds > MAX_COOLDOWN) revert InvalidTierConfig();
        if (cfg.deploySlots > MAX_DEPLOY_SLOTS) revert InvalidTierConfig();
        if (cfg.maxLiveCampaigns > MAX_LIVE_CAMPAIGNS_BOUND) revert InvalidTierConfig();
        if (cfg.creatorNoSellBlocks > MAX_NO_SELL_BLOCKS) revert InvalidTierConfig();
        tierConfig[tier] = cfg;
        emit TierConfigUpdated(tier, cfg);
    }

    function setCreatorTier(address creator, uint8 tier) external onlyOwner {
        if (tier > 2) revert InvalidTier();
        creatorTier[creator] = tier;
        emit CreatorTierUpdated(creator, tier);
    }

    function batchSetCreatorTier(
        address[] calldata creators,
        uint8[] calldata tiers
    ) external onlyOwner {
        if (creators.length != tiers.length) revert LengthMismatch();
        for (uint256 i = 0; i < creators.length; i++) {
            if (tiers[i] > 2) revert InvalidTier();
            creatorTier[creators[i]] = tiers[i];
            emit CreatorTierUpdated(creators[i], tiers[i]);
        }
    }

    function setAbandonTimeout(uint256 newTimeout) external onlyOwner {
        abandonTimeout = newTimeout;
        emit AbandonTimeoutUpdated(newTimeout);
    }

    function setAntiVampLockout(uint256 newLockout) external onlyOwner {
        if (newLockout > MAX_ANTI_VAMP_LOCKOUT) revert ParamTooHigh();
        antiVampLockout = newLockout;
        emit AntiVampLockoutUpdated(newLockout);
    }

    function setGlobalPauseBuys(bool v) external onlyOwner {
        globalPauseBuys = v;
        emit GlobalPauseBuysSet(v);
    }

    // ── Campaign lifecycle callbacks ──

    /// @notice Called by a campaign on graduation. Decrements active count.
    /// @dev Underflow-guarded for defense in depth — a buggy campaign that
    /// double-calls this should not brick finalize for the creator.
    function onCampaignFinalized(address creator_) external {
        if (!isRegisteredCampaign[msg.sender]) revert NotRegistered();
        isRegisteredCampaign[msg.sender] = false;
        if (activeCampaignCount[creator_] > 0) {
            activeCampaignCount[creator_]--;
        }
    }

    /// @notice Owner-only emergency pause for a single campaign. Blocks new
    /// buys; sells stay open so holders always have an exit.
    function setCampaignPaused(address campaign, bool v) external onlyOwner {
        if (!isRegisteredCampaign[campaign]) revert NotRegistered();
        LaunchCampaign(payable(campaign)).setPaused(v);
    }

    /// @notice Anyone can mark a campaign abandoned after `abandonTimeout` of
    /// inactivity. Frees the creator's active-campaign slot and blocks new
    /// buys on the campaign. Sells stay open so holders can exit.
    function abandonCampaign(address campaign) external {
        if (!isRegisteredCampaign[campaign]) revert NotRegistered();
        LaunchCampaign c = LaunchCampaign(payable(campaign));
        if (c.launched()) revert AlreadyFinalized();
        if (block.timestamp < c.lastActivityTime() + abandonTimeout) revert AbandonTooEarly();

        address creator_ = c.creator();
        isRegisteredCampaign[campaign] = false;
        if (activeCampaignCount[creator_] > 0) {
            activeCampaignCount[creator_]--;
        }
        c.markAbandoned();
        emit CampaignAbandoned(creator_, campaign);
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
        if (newConfig.totalSupply > MAX_TOTAL_SUPPLY) revert ParamTooHigh();
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
