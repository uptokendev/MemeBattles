// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Malicious/native receiver used in tests to probe reentrancy safety.
///
/// Mode 0: revert on receive (forces escrow path in LaunchCampaign._sendNativeFee)
/// Mode 1: accept funds and attempt to re-enter by calling claimPendingNative()
///         on the target campaign. This should fail due to ReentrancyGuard.
contract ReenteringFeeRecipient {
    address public target;
    uint8 public mode;
    bool public lastReenterOk;

    function setTarget(address t) external {
        target = t;
    }

    function setMode(uint8 m) external {
        mode = m;
    }

    receive() external payable {
        if (mode == 0) {
            revert("nope");
        }
        if (mode == 1 && target != address(0)) {
            (bool ok, ) = target.call(abi.encodeWithSignature("claimPendingNative()"));
            lastReenterOk = ok;
        }
    }
}
