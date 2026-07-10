// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRewardDistributor {
    function createBatch(bytes32 batchId, bytes32 merkleRoot, uint64 claimDeadline) external payable;
}

/// @title CommunityRewardsVault
/// @notice Holds community-directed native funds while tracking the split between
///         Warzone Airdrops and Squad Pool balances.
contract CommunityRewardsVault {
    address public immutable admin;
    address public router;
    address public rewardDistributor;
    address public airdropOperator;

    uint256 public warzoneAirdropBalance;
    uint256 public squadPoolBalance;

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event RewardDistributorUpdated(address indexed oldDistributor, address indexed newDistributor);
    event AirdropOperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event AirdropDeposited(address indexed caller, uint256 amount, uint256 newTrackedBalance);
    event SquadPoolDeposited(address indexed caller, uint256 amount, uint256 newTrackedBalance);
    event AirdropWithdrawn(address indexed to, uint256 amount, uint256 remainingTrackedBalance);
    event SquadPoolWithdrawn(address indexed to, uint256 amount, uint256 remainingTrackedBalance);
    event AirdropBatchFunded(
        bytes32 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed distributor,
        uint256 amount,
        uint64 claimDeadline,
        uint256 remainingTrackedBalance
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "not router");
        _;
    }

    modifier onlyAdminOrAirdropOperator() {
        require(msg.sender == admin || msg.sender == airdropOperator, "not airdrop operator");
        _;
    }

    constructor(address _admin, address _router) {
        require(_admin != address(0), "admin=0");
        admin = _admin;
        router = _router;
        emit RouterUpdated(address(0), _router);
    }

    receive() external payable {
        revert("direct disabled");
    }

    function setRouter(address newRouter) external onlyAdmin {
        emit RouterUpdated(router, newRouter);
        router = newRouter;
    }

    function setRewardDistributor(address newDistributor) external onlyAdmin {
        require(newDistributor != address(0), "distributor=0");
        emit RewardDistributorUpdated(rewardDistributor, newDistributor);
        rewardDistributor = newDistributor;
    }

    function setAirdropOperator(address newOperator) external onlyAdmin {
        emit AirdropOperatorUpdated(airdropOperator, newOperator);
        airdropOperator = newOperator;
    }

    function depositAirdrop() external payable onlyRouter {
        require(msg.value > 0, "amount=0");
        warzoneAirdropBalance += msg.value;
        emit AirdropDeposited(msg.sender, msg.value, warzoneAirdropBalance);
    }

    function depositSquadPool() external payable onlyRouter {
        require(msg.value > 0, "amount=0");
        squadPoolBalance += msg.value;
        emit SquadPoolDeposited(msg.sender, msg.value, squadPoolBalance);
    }

    /// @notice Atomically moves tracked airdrop funds into a new Merkle claim batch.
    /// @dev The configured vault must also be configured as RewardDistributor.batchOperator.
    function fundAirdropBatch(
        bytes32 batchId,
        bytes32 merkleRoot,
        uint64 claimDeadline,
        uint256 amount
    ) external onlyAdminOrAirdropOperator {
        address distributor = rewardDistributor;
        require(distributor != address(0), "distributor unset");
        require(amount > 0, "amount=0");
        require(amount <= warzoneAirdropBalance, "tracked insufficient");
        require(amount <= address(this).balance, "insufficient");

        warzoneAirdropBalance -= amount;
        IRewardDistributor(distributor).createBatch{value: amount}(batchId, merkleRoot, claimDeadline);

        emit AirdropBatchFunded(
            batchId,
            merkleRoot,
            distributor,
            amount,
            claimDeadline,
            warzoneAirdropBalance
        );
    }

    function withdrawAirdrop(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "to=0");
        require(amount <= warzoneAirdropBalance, "tracked insufficient");
        require(amount <= address(this).balance, "insufficient");
        warzoneAirdropBalance -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit AirdropWithdrawn(to, amount, warzoneAirdropBalance);
    }

    function withdrawSquadPool(address payable to, uint256 amount) external onlyAdmin {
        require(to != address(0), "to=0");
        require(amount <= squadPoolBalance, "tracked insufficient");
        require(amount <= address(this).balance, "insufficient");
        squadPoolBalance -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit SquadPoolWithdrawn(to, amount, squadPoolBalance);
    }

    function totalTracked() external view returns (uint256) {
        return warzoneAirdropBalance + squadPoolBalance;
    }
}
