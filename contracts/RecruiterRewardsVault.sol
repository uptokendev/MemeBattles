// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NativeTreasuryVaultBase} from "./NativeTreasuryVaultBase.sol";

/// @title RecruiterRewardsVault
/// @notice Custodial native-asset bucket for recruiter-directed fee slices with an optional capped operator payout lane.
contract RecruiterRewardsVault is NativeTreasuryVaultBase {
    address public operator;
    uint256 public maxPayoutPerTx;
    uint256 public dailyPayoutCap;
    bool public payoutsPaused;
    uint256 public lastDay;
    uint256 public dailySpent;

    event OperatorUpdated(address indexed operator);
    event PayoutCapsUpdated(uint256 maxPayoutPerTx, uint256 dailyPayoutCap);
    event PayoutsPaused(bool paused);
    event Payout(address indexed to, uint256 amount);

    modifier onlyOperator() {
        require(msg.sender == operator, "not operator");
        _;
    }

    constructor(address _admin) NativeTreasuryVaultBase(_admin) {
        payoutsPaused = true;
        lastDay = block.timestamp / 1 days;
        emit OperatorUpdated(address(0));
        emit PayoutsPaused(true);
    }

    function setOperator(address newOperator) external onlyAdmin {
        operator = newOperator;
        emit OperatorUpdated(newOperator);
    }

    function setPayoutCaps(uint256 newMaxPayoutPerTx, uint256 newDailyPayoutCap) external onlyAdmin {
        maxPayoutPerTx = newMaxPayoutPerTx;
        dailyPayoutCap = newDailyPayoutCap;
        emit PayoutCapsUpdated(newMaxPayoutPerTx, newDailyPayoutCap);
    }

    function setPayoutsPaused(bool paused) external onlyAdmin {
        if (!paused) {
            require(operator != address(0), "operator=0");
            require(maxPayoutPerTx != 0, "maxPayoutPerTx=0");
            require(dailyPayoutCap != 0, "dailyPayoutCap=0");
        }
        payoutsPaused = paused;
        emit PayoutsPaused(paused);
    }

    function payout(address payable to, uint256 amount) external onlyOperator {
        require(!payoutsPaused, "payouts paused");
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        require(amount <= address(this).balance, "insufficient");
        require(amount <= maxPayoutPerTx, "maxPayoutPerTx");

        uint256 currentDay = block.timestamp / 1 days;
        if (currentDay != lastDay) {
            lastDay = currentDay;
            dailySpent = 0;
        }

        require(dailySpent + amount <= dailyPayoutCap, "dailyPayoutCap");
        dailySpent += amount;

        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit Payout(to, amount);
    }
}
