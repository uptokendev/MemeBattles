// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * MemeBattles UP Vote Treasury (v1 - Forwarding)
 *
 * - Users pay a small fee (BNB or supported ERC20) to cast an upvote for a campaign/token.
 * - Payments are forwarded immediately to feeReceiver (do not sit in this contract).
 * - Emits VoteCast events; off-chain indexer tallies and ranks.
 * - Enforces min amounts per asset on-chain.
 * - Supports fee-on-transfer tokens by measuring actual received amount.
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        bool ok = token.transfer(to, value);
        require(ok, "SAFE_ERC20_TRANSFER_FAILED");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        bool ok = token.transferFrom(from, to, value);
        require(ok, "SAFE_ERC20_TRANSFERFROM_FAILED");
    }
}

abstract contract Ownable {
    address public owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    constructor(address initialOwner) {
        require(initialOwner != address(0), "OWNER_ZERO");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "OWNER_ZERO");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

contract UPVoteTreasury is Ownable {
    using SafeERC20 for IERC20;

    // Use address(0) to represent native BNB.
    address public constant NATIVE = address(0);

    struct AssetConfig {
        bool enabled;
        uint256 minAmount; // minimum payment to count as a vote
    }

    mapping(address => AssetConfig) public assetConfig;

    // Campaign allowlist (optional)
    bool public campaignAllowlistEnabled;
    mapping(address => bool) public campaignAllowed;

    address public feeReceiver;

    event AssetConfigured(address indexed asset, bool enabled, uint256 minAmount);
    event CampaignAllowlistToggled(bool enabled);
    event CampaignAllowed(address indexed campaign, bool allowed);
    event FeeReceiverUpdated(address indexed previousReceiver, address indexed newReceiver);

    event VoteCast(
        address indexed campaign,
        address indexed voter,
        address indexed asset,   // address(0) for BNB, else ERC20
        uint256 amountPaid,      // actual received amount (for ERC20, measured)
        bytes32 meta
    );

    // Rescue events (in case tokens/BNB are accidentally sent to this contract)
    event Rescue(address indexed asset, address indexed to, uint256 amount);

    constructor(address initialOwner, address initialFeeReceiver) Ownable(initialOwner) {
        require(initialFeeReceiver != address(0), "FEE_RECEIVER_ZERO");
        feeReceiver = initialFeeReceiver;

        assetConfig[NATIVE] = AssetConfig({ enabled: true, minAmount: 0 });
        emit AssetConfigured(NATIVE, true, 0);
        emit FeeReceiverUpdated(address(0), initialFeeReceiver);
    }

    // -----------------------------
    // Admin configuration
    // -----------------------------

    function setAsset(address asset, bool enabled, uint256 minAmount) external onlyOwner {
        assetConfig[asset] = AssetConfig({ enabled: enabled, minAmount: minAmount });
        emit AssetConfigured(asset, enabled, minAmount);
    }

    function setFeeReceiver(address newFeeReceiver) external onlyOwner {
        require(newFeeReceiver != address(0), "FEE_RECEIVER_ZERO");
        emit FeeReceiverUpdated(feeReceiver, newFeeReceiver);
        feeReceiver = newFeeReceiver;
    }

    function setCampaignAllowlistEnabled(bool enabled) external onlyOwner {
        campaignAllowlistEnabled = enabled;
        emit CampaignAllowlistToggled(enabled);
    }

    function setCampaignAllowed(address campaign, bool allowed) external onlyOwner {
        campaignAllowed[campaign] = allowed;
        emit CampaignAllowed(campaign, allowed);
    }

    // -----------------------------
    // Voting
    // -----------------------------

    function voteWithBNB(address campaign, bytes32 meta) external payable {
        _requireCampaignAllowed(campaign);

        AssetConfig memory cfg = assetConfig[NATIVE];
        require(cfg.enabled, "ASSET_DISABLED");
        require(msg.value >= cfg.minAmount, "AMOUNT_TOO_LOW");

        emit VoteCast(campaign, msg.sender, NATIVE, msg.value, meta);

        (bool ok, ) = payable(feeReceiver).call{ value: msg.value }("");
        require(ok, "FEE_FORWARD_BNB_FAILED");
    }

    /**
     * voteWithToken supports fee-on-transfer tokens:
     * - pulls tokens in
     * - measures actual received
     * - enforces minAmount against received
     * - forwards received to feeReceiver
     */
    function voteWithToken(address campaign, address token, uint256 amount, bytes32 meta) external {
        _requireCampaignAllowed(campaign);

        require(token != address(0), "TOKEN_ZERO");
        AssetConfig memory cfg = assetConfig[token];
        require(cfg.enabled, "ASSET_DISABLED");
        require(amount > 0, "AMOUNT_ZERO");

        IERC20 erc20 = IERC20(token);
        uint256 beforeBal = erc20.balanceOf(address(this));
        erc20.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBal = erc20.balanceOf(address(this));

        uint256 received = afterBal - beforeBal;
        require(received >= cfg.minAmount, "AMOUNT_TOO_LOW");

        emit VoteCast(campaign, msg.sender, token, received, meta);

        // Forward only what was actually received
        erc20.safeTransfer(feeReceiver, received);
    }

    // -----------------------------
    // Rescue (should normally stay unused)
    // -----------------------------

    function rescueBNB(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "TO_ZERO");
        require(amount <= address(this).balance, "INSUFFICIENT_BNB");
        (bool ok, ) = to.call{ value: amount }("");
        require(ok, "BNB_RESCUE_FAILED");
        emit Rescue(NATIVE, to, amount);
    }

    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(0), "TOKEN_ZERO");
        require(to != address(0), "TO_ZERO");
        IERC20(token).safeTransfer(to, amount);
        emit Rescue(token, to, amount);
    }

    // -----------------------------
    // Internal
    // -----------------------------

    function _requireCampaignAllowed(address campaign) internal view {
        require(campaign != address(0), "CAMPAIGN_ZERO");
        if (campaignAllowlistEnabled) {
            require(campaignAllowed[campaign], "CAMPAIGN_NOT_ALLOWED");
        }
    }

    receive() external payable {
        // Accept direct BNB transfers (not counted as votes unless voteWithBNB is called)
    }
}