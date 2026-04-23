// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CommunityRewardsVault
/// @notice Holds community-directed native funds while tracking the split between
///         Warzone Airdrops and Squad Pool balances.
contract CommunityRewardsVault {
    address public immutable admin;
    address public router;

    uint256 public warzoneAirdropBalance;
    uint256 public squadPoolBalance;

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);
    event AirdropDeposited(address indexed caller, uint256 amount, uint256 newTrackedBalance);
    event SquadPoolDeposited(address indexed caller, uint256 amount, uint256 newTrackedBalance);
    event AirdropWithdrawn(address indexed to, uint256 amount, uint256 remainingTrackedBalance);
    event SquadPoolWithdrawn(address indexed to, uint256 amount, uint256 remainingTrackedBalance);

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "not router");
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
