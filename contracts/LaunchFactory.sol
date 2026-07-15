// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {LaunchCampaign} from "./LaunchCampaign.sol";
import {CreatorRegistry} from "./CreatorRegistry.sol";
import {RiskRegistry} from "./RiskRegistry.sol";
import {PermanentLpLocker} from "./PermanentLpLocker.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

contract LaunchFactory is Ownable {
    using ECDSA for bytes32;

    error RouterZero();
    error NameEmpty();
    error SymbolEmpty();
    error LogoEmpty();
    error RecipientZero();
    error ImplementationZero();
    error GraduationOracleZero();
    error ContractCodeMissing();
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
    error LaunchProtectionBounds();
    error NotLive();
    error AlreadyLive();
    error FactoryLocked();
    error InvalidRouteProfile();
    error RouteAuthorityZero();
    error RouteAuthorizationExpired();
    error InvalidRouteAuthorization();
    error RouteAuthorizationReplayed();
    error Paused();
    error CreatePaused();
    error CreatorNotEligible();
    error RiskNotEligible();
    error UnknownCampaign();

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
        string metadataURI;
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
    }

    struct RouteAuthorization {
        uint8 tradeRouteProfile;
        uint8 finalizeRouteProfile;
        uint64 deadline;
        bytes signature;
    }

    uint256 private constant MAX_BPS = 10_000;
    uint8 public constant ROUTE_PROFILE_STANDARD_LINKED = 0;
    uint8 public constant ROUTE_PROFILE_STANDARD_UNLINKED = 1;
    uint8 public constant ROUTE_PROFILE_OG_LINKED = 2;

    LaunchConfig public config;
    address public feeRecipient;
    uint256 public protocolFeeBps;
    uint8 public tradeRouteProfile;
    uint8 public finalizeRouteProfile;
    address public routeAuthority;

    bool public live;
    bool public globalPaused;
    bool public createPaused;
    bool public requireAuthorizedTrading;
    uint256 public launchProtectionBlocks;
    uint256 public launchProtectionMaxBuyWei;
    uint256 public launchProtectionMaxWalletWei;

    uint256 public constant LEAGUE_FEE_BPS = 75;
    uint256 public constant DEFAULT_GRADUATION_USD_THRESHOLD = 30_000 ether;
    uint256 public constant MAX_BASE_PRICE = 1_000 ether;
    uint256 public constant MAX_PRICE_SLOPE = 1e36;
    uint256 public constant MAX_GRADUATION_TARGET = 1_000_000 ether;
    uint256 public constant MAX_LAUNCH_PROTECTION_BLOCKS = 28_800;
    uint256 public constant MAX_LAUNCH_PROTECTION_BUY_WEI = 1_000 ether;
    uint256 public constant MAX_LAUNCH_PROTECTION_WALLET_WEI = 1_000 ether;
    address public immutable leagueReceiver;
    address public immutable campaignImplementation;
    PermanentLpLocker public immutable permanentLpLocker;
    address public router;
    address public graduationOracle;
    CreatorRegistry public creatorRegistry;
    RiskRegistry public riskRegistry;

    CampaignInfo[] private _campaigns;
    mapping(address => bool) public isCampaign;
    mapping(bytes32 => bool) public usedCreateRouteAuthorizations;

    event CampaignCreated(
        uint256 indexed id,
        address indexed campaign,
        address indexed token,
        address creator,
        string name,
        string symbol,
        string logoURI,
        string metadataURI
    );
    event ConfigUpdated(LaunchConfig newConfig);
    event FeeRecipientUpdated(address indexed newRecipient);
    event RouterUpdated(address indexed newRouter);
    event GraduationOracleUpdated(address indexed newOracle);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event RouteProfilesUpdated(uint8 tradeRouteProfile, uint8 finalizeRouteProfile);
    event RouteAuthorityUpdated(address indexed newAuthority);
    event LaunchProtectionConfigUpdated(uint256 blocks_, uint256 maxBuyWei, uint256 maxWalletWei);
    event LiveEnabled(uint64 at);
    event GlobalPauseUpdated(bool paused);
    event CreatePauseUpdated(bool paused);
    event RegistriesUpdated(address indexed creatorRegistry, address indexed riskRegistry);
    event RequireAuthorizedTradingUpdated(bool required);
    event CampaignPauseUpdated(address indexed campaign, bool paused, bool buysPaused, bool sellsPaused, bool graduationPaused);
    event CampaignGraduated(address indexed campaign, address indexed creator, address indexed lpToken, address locker);

    modifier whenMutable() {
        if (_campaigns.length != 0) revert FactoryLocked();
        _;
    }

    constructor(address topazRouter_, address treasuryRouter_, address campaignImplementation_, address graduationOracle_) Ownable(msg.sender) {
        if (topazRouter_ == address(0)) revert RouterZero();
        if (treasuryRouter_ == address(0)) revert RecipientZero();
        if (campaignImplementation_ == address(0)) revert ImplementationZero();
        if (graduationOracle_ == address(0)) revert GraduationOracleZero();
        if (
            topazRouter_.code.length == 0 ||
            treasuryRouter_.code.length == 0 ||
            campaignImplementation_.code.length == 0 ||
            graduationOracle_.code.length == 0
        ) revert ContractCodeMissing();

        router = topazRouter_;
        leagueReceiver = treasuryRouter_;
        feeRecipient = treasuryRouter_;
        campaignImplementation = campaignImplementation_;
        graduationOracle = graduationOracle_;
        permanentLpLocker = new PermanentLpLocker(address(this));
        config = LaunchConfig({
            totalSupply: 1_000_000_000 ether,
            curveBps: 8800,
            liquidityTokenBps: 1000,
            basePrice: 5e13,
            priceSlope: 1e9,
            graduationTarget: DEFAULT_GRADUATION_USD_THRESHOLD,
            liquidityBps: 8000
        });
        protocolFeeBps = 200;
        tradeRouteProfile = ROUTE_PROFILE_STANDARD_UNLINKED;
        finalizeRouteProfile = ROUTE_PROFILE_STANDARD_UNLINKED;
        requireAuthorizedTrading = false;
    }

    function enableLive() external onlyOwner {
        if (live) revert AlreadyLive();
        live = true;
        emit LiveEnabled(uint64(block.timestamp));
    }

    receive() external payable {}

    function createCampaign(CampaignRequest calldata req) external returns (address campaignAddr, address tokenAddr) {
        return _createCampaign(req, tradeRouteProfile, finalizeRouteProfile);
    }

    function createCampaignAuthorized(CampaignRequest calldata req, RouteAuthorization calldata routeAuth)
        external
        returns (address campaignAddr, address tokenAddr)
    {
        _verifyRouteAuthorization(msg.sender, req, routeAuth);
        return _createCampaign(req, routeAuth.tradeRouteProfile, routeAuth.finalizeRouteProfile);
    }

    function _createCampaign(
        CampaignRequest calldata req,
        uint8 campaignTradeRouteProfile,
        uint8 campaignFinalizeRouteProfile
    ) internal returns (address campaignAddr, address tokenAddr) {
        if (!live) revert NotLive();
        if (globalPaused) revert Paused();
        if (createPaused) revert CreatePaused();
        if (bytes(req.name).length == 0) revert NameEmpty();
        if (bytes(req.symbol).length == 0) revert SymbolEmpty();
        if (bytes(req.logoURI).length == 0) revert LogoEmpty();
        if (req.basePrice != 0 && req.basePrice > MAX_BASE_PRICE) revert ParamTooHigh();
        if (req.priceSlope != 0 && req.priceSlope > MAX_PRICE_SLOPE) revert ParamTooHigh();
        if (req.graduationTarget != 0 && req.graduationTarget > MAX_GRADUATION_TARGET) revert ParamTooHigh();

        (uint256 creatorBuyLockUntil, uint256 creatorBuyCapWei, uint256 maxClusterWallets) = _enforceCreatorEligibility(msg.sender);
        _enforceRiskLaunch(msg.sender, maxClusterWallets);

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
            graduationTarget: req.graduationTarget == 0 ? config.graduationTarget : req.graduationTarget,
            graduationOracle: graduationOracle,
            liquidityBps: config.liquidityBps,
            protocolFeeBps: protocolFeeBps,
            leagueFeeBps: LEAGUE_FEE_BPS,
            leagueReceiver: leagueReceiver,
            router: router,
            lpReceiver: address(permanentLpLocker),
            feeRecipient: feeRecipient,
            creator: msg.sender,
            factory: address(this),
            creatorRegistry: address(creatorRegistry),
            riskRegistry: address(riskRegistry),
            creatorBuyLockUntil: creatorBuyLockUntil,
            creatorBuyCapWei: creatorBuyCapWei,
            requireAuthorizedTrading: requireAuthorizedTrading,
            tradeRouteProfile: campaignTradeRouteProfile,
            finalizeRouteProfile: campaignFinalizeRouteProfile
        });

        address clone = Clones.clone(campaignImplementation);
        LaunchCampaign(payable(clone)).initialize(params);
        campaignAddr = clone;
        tokenAddr = address(LaunchCampaign(payable(clone)).token());
        isCampaign[campaignAddr] = true;
        string memory metadataURI = "";

        if (address(creatorRegistry) != address(0)) {
            creatorRegistry.recordLaunch(msg.sender);
        }

        _campaigns.push(
            CampaignInfo({
                campaign: campaignAddr,
                token: tokenAddr,
                creator: msg.sender,
                name: req.name,
                symbol: req.symbol,
                logoURI: req.logoURI,
                metadataURI: metadataURI,
                xAccount: req.xAccount,
                website: req.website,
                extraLink: req.extraLink,
                createdAt: uint64(block.timestamp)
            })
        );

        emit CampaignCreated(_campaigns.length - 1, campaignAddr, tokenAddr, msg.sender, req.name, req.symbol, req.logoURI, metadataURI);
    }

    function notifyCampaignGraduated(address campaignCreator, address lpToken) external {
        if (!isCampaign[msg.sender]) revert UnknownCampaign();
        if (lpToken != address(0) && !permanentLpLocker.registeredLpToken(lpToken)) {
            permanentLpLocker.registerLpToken(lpToken);
        }
        if (address(creatorRegistry) != address(0)) {
            creatorRegistry.recordGraduation(campaignCreator);
        }
        emit CampaignGraduated(msg.sender, campaignCreator, lpToken, address(permanentLpLocker));
    }

    function setConfig(LaunchConfig calldata newConfig) external onlyOwner whenMutable {
        _validateConfig(newConfig);
        config = newConfig;
        emit ConfigUpdated(newConfig);
    }

    function setRouter(address newRouter) external onlyOwner whenMutable {
        if (newRouter == address(0)) revert RouterZero();
        if (newRouter.code.length == 0) revert ContractCodeMissing();
        router = newRouter;
        emit RouterUpdated(newRouter);
    }

    function setGraduationOracle(address newOracle) external onlyOwner whenMutable {
        if (newOracle == address(0)) revert GraduationOracleZero();
        if (newOracle.code.length == 0) revert ContractCodeMissing();
        graduationOracle = newOracle;
        emit GraduationOracleUpdated(newOracle);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner whenMutable {
        if (newRecipient == address(0)) revert RecipientZero();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function setProtocolFee(uint256 newProtocolFeeBps) external onlyOwner whenMutable {
        if (newProtocolFeeBps > 1000) revert FeeTooHigh();
        if (newProtocolFeeBps < LEAGUE_FEE_BPS) revert FeeTooLowForLeague();
        protocolFeeBps = newProtocolFeeBps;
        emit ProtocolFeeUpdated(newProtocolFeeBps);
    }

    function setRouteProfiles(uint8 newTradeRouteProfile, uint8 newFinalizeRouteProfile) external onlyOwner whenMutable {
        if (!_isValidRouteProfile(newTradeRouteProfile) || !_isValidRouteProfile(newFinalizeRouteProfile)) revert InvalidRouteProfile();
        tradeRouteProfile = newTradeRouteProfile;
        finalizeRouteProfile = newFinalizeRouteProfile;
        emit RouteProfilesUpdated(newTradeRouteProfile, newFinalizeRouteProfile);
    }

    function setRouteAuthority(address newAuthority) external onlyOwner {
        routeAuthority = newAuthority;
        emit RouteAuthorityUpdated(newAuthority);
    }

    function setLaunchProtectionConfig(uint256 blocks_, uint256 maxBuyWei, uint256 maxWalletWei) external onlyOwner whenMutable {
        _validateLaunchProtectionConfig(blocks_, maxBuyWei, maxWalletWei);
        launchProtectionBlocks = blocks_;
        launchProtectionMaxBuyWei = maxBuyWei;
        launchProtectionMaxWalletWei = maxWalletWei;
        emit LaunchProtectionConfigUpdated(blocks_, maxBuyWei, maxWalletWei);
    }

    function launchProtectionConfig() external view returns (uint256 blocks_, uint256 maxBuyWei, uint256 maxWalletWei) {
        return (launchProtectionBlocks, launchProtectionMaxBuyWei, launchProtectionMaxWalletWei);
    }

    function setRegistries(address newCreatorRegistry, address newRiskRegistry) external onlyOwner {
        creatorRegistry = CreatorRegistry(newCreatorRegistry);
        riskRegistry = RiskRegistry(newRiskRegistry);
        emit RegistriesUpdated(newCreatorRegistry, newRiskRegistry);
    }

    function setGlobalPaused(bool paused) external onlyOwner {
        globalPaused = paused;
        emit GlobalPauseUpdated(paused);
    }

    function setCreatePaused(bool paused) external onlyOwner {
        createPaused = paused;
        emit CreatePauseUpdated(paused);
    }

    function setRequireAuthorizedTrading(bool required) external onlyOwner {
        requireAuthorizedTrading = required;
        emit RequireAuthorizedTradingUpdated(required);
    }

    function setCampaignPauses(address campaign, bool paused, bool buysPaused, bool sellsPaused, bool graduationPaused) external onlyOwner {
        LaunchCampaign(payable(campaign)).setPauseState(paused, buysPaused, sellsPaused, graduationPaused);
        emit CampaignPauseUpdated(campaign, paused, buysPaused, sellsPaused, graduationPaused);
    }

    function setCampaignRequireAuthorizedTrading(address campaign, bool required) external onlyOwner {
        LaunchCampaign(payable(campaign)).setRequireAuthorizedTrading(required);
    }

    function campaignsCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function _enforceCreatorEligibility(address creator) internal view returns (uint256 lockUntil, uint256 buyCapWei, uint256 maxClusterWallets) {
        if (address(creatorRegistry) == address(0)) return (0, 0, 0);
        if (!creatorRegistry.canLaunch(creator)) revert CreatorNotEligible();
        CreatorRegistry.CreatorRules memory rules = creatorRegistry.getCreatorRules(creator);
        return (block.timestamp + rules.creatorBuyLockSeconds, rules.creatorBuyCapWei, rules.maxClusterWallets);
    }

    function _enforceRiskLaunch(address creator, uint256 maxClusterWallets) internal view {
        if (address(riskRegistry) == address(0)) return;
        if (!riskRegistry.canCreatorLaunch(creator, maxClusterWallets)) revert RiskNotEligible();
    }

    function _verifyRouteAuthorization(address creator, CampaignRequest calldata req, RouteAuthorization calldata routeAuth) internal {
        address authority = routeAuthority;
        if (authority == address(0)) revert RouteAuthorityZero();
        if (routeAuth.deadline < block.timestamp) revert RouteAuthorizationExpired();
        if (!_isValidRouteProfile(routeAuth.tradeRouteProfile) || !_isValidRouteProfile(routeAuth.finalizeRouteProfile)) revert InvalidRouteProfile();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(
                abi.encode(
                    "MWZ_CREATE_ROUTE_AUTH",
                    block.chainid,
                    address(this),
                    creator,
                    _hashCampaignRequest(req),
                    routeAuth.tradeRouteProfile,
                    routeAuth.finalizeRouteProfile,
                    routeAuth.deadline
                )
            )
        );
        if (digest.recover(routeAuth.signature) != authority) revert InvalidRouteAuthorization();
        if (usedCreateRouteAuthorizations[digest]) revert RouteAuthorizationReplayed();
        usedCreateRouteAuthorizations[digest] = true;
    }

    function _hashCampaignRequest(CampaignRequest calldata req) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(bytes(req.name)),
                keccak256(bytes(req.symbol)),
                keccak256(bytes(req.logoURI)),
                keccak256(bytes(req.xAccount)),
                keccak256(bytes(req.website)),
                keccak256(bytes(req.extraLink)),
                req.basePrice,
                req.priceSlope,
                req.graduationTarget,
                req.lpReceiver
            )
        );
    }

    function getCampaign(uint256 id) external view returns (CampaignInfo memory) {
        if (id >= _campaigns.length) revert OutOfBounds();
        return _campaigns[id];
    }

    function getCampaignPage(uint256 offset, uint256 limit) external view returns (CampaignInfo[] memory page) {
        if (!(_campaigns.length == 0 || offset < _campaigns.length)) revert Offset();
        if (_campaigns.length == 0 || limit == 0) return new CampaignInfo[](0);
        uint256 end = offset + limit;
        if (end > _campaigns.length) end = _campaigns.length;
        uint256 size = end > offset ? end - offset : 0;
        page = new CampaignInfo[](size);
        for (uint256 i = 0; i < size; i++) page[i] = _campaigns[offset + i];
    }

    function _isValidRouteProfile(uint8 profile) internal pure returns (bool) {
        return profile == ROUTE_PROFILE_STANDARD_LINKED || profile == ROUTE_PROFILE_STANDARD_UNLINKED || profile == ROUTE_PROFILE_OG_LINKED;
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

    function _validateLaunchProtectionConfig(uint256 blocks_, uint256 maxBuyWei, uint256 maxWalletWei) internal pure {
        if (blocks_ > MAX_LAUNCH_PROTECTION_BLOCKS) revert LaunchProtectionBounds();
        if (maxBuyWei > MAX_LAUNCH_PROTECTION_BUY_WEI) revert LaunchProtectionBounds();
        if (maxWalletWei > MAX_LAUNCH_PROTECTION_WALLET_WEI) revert LaunchProtectionBounds();
    }
}
