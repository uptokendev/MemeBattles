from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


campaign_path = Path("contracts/LaunchCampaign.sol")
campaign = campaign_path.read_text()

campaign = replace_once(campaign, "    uint256 private constant MAX_BPS = 10_000;\n", "    uint256 private constant MAX_BPS = 10_000;\n    uint256 private constant MAX_TOTAL_SUPPLY = type(uint128).max;\n", "campaign max supply constant")
campaign = replace_once(campaign, "    uint256 public sold;\n    bool public launched;\n", "    uint256 public sold;\n    /// @notice Net native currency raised through curve trades, excluding fees and unsolicited transfers.\n    uint256 public netRaisedWei;\n    bool public launched;\n", "net raised storage")
campaign = replace_once(campaign, "        if (params.totalSupply == 0) revert InvalidSupply();\n", "        if (params.totalSupply == 0 || params.totalSupply > MAX_TOTAL_SUPPLY) revert InvalidSupply();\n", "campaign supply validation")
campaign = replace_once(campaign, "        if (gross > _availableNativeBalance()) revert Insolvent();\n", "        if (gross > netRaisedWei || gross > _availableNativeBalance()) revert Insolvent();\n", "sell solvency")
campaign = replace_once(campaign, "        sold -= amountIn;\n        tokenInterface.safeTransferFrom(seller, address(this), amountIn);\n", "        sold -= amountIn;\n        netRaisedWei -= gross;\n        tokenInterface.safeTransferFrom(seller, address(this), amountIn);\n", "sell accounting")
campaign = replace_once(campaign, "        sold += amountOut;\n        tokenInterface.safeTransfer(buyer, amountOut);\n", "        sold += amountOut;\n        netRaisedWei += costNoFee;\n        tokenInterface.safeTransfer(buyer, amountOut);\n", "buy accounting")
campaign = replace_once(campaign, "        return _availableNativeBalance() >= graduationNativeTarget();\n", "        return netRaisedWei >= graduationNativeTarget();\n", "graduation check")
campaign = replace_once(campaign, "        if (_availableNativeBalance() < nativeTarget) revert ThresholdNotMet();\n", "        if (netRaisedWei < nativeTarget) revert ThresholdNotMet();\n", "finalize threshold")
campaign = replace_once(campaign, "        g.graduationBalance = _availableNativeBalance();\n", "        g.graduationBalance = netRaisedWei;\n", "graduation balance")
campaign = replace_once(campaign, "        uint256 protocolFee = (g.graduationBalance * protocolFeeBps) / MAX_BPS;\n        if (protocolFee > 0 && feeRecipient != address(0)) _routeFeeOrSendLegacy(protocolFee, ROUTE_KIND_FINALIZE, g.graduationBalance);\n\n        uint256 remainingAfterFee = _availableNativeBalance();\n", "        uint256 protocolFee = feeRecipient == address(0) ? 0 : (g.graduationBalance * protocolFeeBps) / MAX_BPS;\n        if (protocolFee > 0) _routeFeeOrSendLegacy(protocolFee, ROUTE_KIND_FINALIZE, g.graduationBalance);\n\n        uint256 remainingAfterFee = g.graduationBalance - protocolFee;\n", "finalize fee accounting")
campaign = replace_once(campaign, "        uint256 creatorPayout = _availableNativeBalance();\n        if (creatorPayout > 0) _sendNative(owner(), creatorPayout);\n", "        uint256 creatorPayout = remainingAfterFee - usedBnb;\n        if (creatorPayout > 0) _sendNative(owner(), creatorPayout);\n", "creator payout accounting")
campaign = replace_once(campaign, "        if (_useUnifiedRewardRouter()) {\n            IPhase1TreasuryRouter(payable(feeRecipient)).route{value: feeAmount}(routeKind, routeProfile);\n            return;\n        }\n", "        if (_useUnifiedRewardRouter()) {\n            try IPhase1TreasuryRouter(payable(feeRecipient)).route{value: feeAmount}(routeKind, routeProfile) {\n                return;\n            } catch {\n                _escrowNative(feeRecipient, feeAmount);\n                return;\n            }\n        }\n", "nonblocking unified routing")
campaign = replace_once(campaign, "    function _sendNativeFee(address payable to, uint256 value) private {\n        if (value == 0) return;\n        (bool ok, ) = to.call{value: value}(\"\");\n        if (!ok) {\n            pendingNative[to] += value;\n            pendingNativeTotal += value;\n            emit NativeEscrowed(to, value);\n        }\n    }\n", "    function _sendNativeFee(address payable to, uint256 value) private {\n        if (value == 0) return;\n        (bool ok, ) = to.call{value: value}(\"\");\n        if (!ok) _escrowNative(to, value);\n    }\n\n    function _escrowNative(address beneficiary, uint256 value) private {\n        pendingNative[beneficiary] += value;\n        pendingNativeTotal += value;\n        emit NativeEscrowed(beneficiary, value);\n    }\n", "escrow helper")
campaign_path.write_text(campaign)

factory_path = Path("contracts/LaunchFactory.sol")
factory = factory_path.read_text()
factory = replace_once(factory, "    uint256 private constant MAX_BPS = 10_000;\n", "    uint256 private constant MAX_BPS = 10_000;\n    uint256 public constant MAX_TOTAL_SUPPLY = type(uint128).max;\n", "factory max supply constant")
factory = replace_once(factory, "            try permanentLpLocker.registerGraduatedPool(\n                msg.sender,\n                campaignCreator,\n                campaignCreator,\n                lpToken,\n                tokenAddr,\n                wrappedNative,\n                lockedLpAmount\n            ) {} catch {\n                permanentLpLocker.registerLpToken(lpToken);\n            }\n", "            permanentLpLocker.registerGraduatedPool(\n                msg.sender,\n                campaignCreator,\n                campaignCreator,\n                lpToken,\n                tokenAddr,\n                wrappedNative,\n                lockedLpAmount\n            );\n", "mandatory graduated pool registration")
factory = replace_once(factory, "        if (newConfig.totalSupply == 0) revert SupplyZero();\n", "        if (newConfig.totalSupply == 0) revert SupplyZero();\n        if (newConfig.totalSupply > MAX_TOTAL_SUPPLY) revert ParamTooHigh();\n", "factory supply validation")
factory_path.write_text(factory)
