// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICommunityRewardsVault {
    function depositAirdrop() external payable;
    function depositSquadPool() external payable;
}

contract TreasuryRouter {
    uint16 internal constant ROUTE_BPS = 10_000;

    enum RouteKind {
        Trade,
        Finalize
    }

    enum RouteProfile {
        StandardLinked,
        StandardUnlinked,
        OgLinked
    }

    struct RouteAmounts {
        uint256 league;
        uint256 recruiter;
        uint256 airdrop;
        uint256 squad;
        uint256 protocol;
    }

    address public immutable admin;
    uint64 public immutable upgradeDelay;

    // Legacy/compatibility naming retained for League Treasury path.
    address public activeVault;
    address public pendingVault;
    uint64 public pendingSince;

    address public recruiterRewardsVault;
    address public communityRewardsVault;
    address public protocolRevenueVault;

    bool public forwardingPaused;

    event Forwarded(address indexed vault, uint256 amount);
    event ForwardFailed(address indexed vault, uint256 amount);
    event ForwardingPaused(bool paused);

    event VaultProposed(address indexed newVault, uint64 executeAfter);
    event VaultActivated(address indexed oldVault, address indexed newVault);

    event RecruiterRewardsVaultUpdated(address indexed oldVault, address indexed newVault);
    event CommunityRewardsVaultUpdated(address indexed oldVault, address indexed newVault);
    event ProtocolRevenueVaultUpdated(address indexed oldVault, address indexed newVault);

    event RouteExecuted(
        RouteKind indexed kind,
        RouteProfile indexed profile,
        uint256 amountIn,
        uint256 leagueAmount,
        uint256 recruiterAmount,
        uint256 airdropAmount,
        uint256 squadAmount,
        uint256 protocolAmount
    );

    modifier onlyAdmin() {
        require(msg.sender == admin, "not admin");
        _;
    }

    constructor(address _admin, address _initialVault, uint64 _upgradeDelaySeconds) {
        require(_admin != address(0), "admin=0");
        require(_initialVault != address(0), "vault=0");
        require(_upgradeDelaySeconds >= 1 hours, "delay too small");
        admin = _admin;
        activeVault = _initialVault;
        upgradeDelay = _upgradeDelaySeconds;
    }

    receive() external payable {
        _forward(msg.value);
    }

    function forward() external {
        _forward(address(this).balance);
    }

    function route(RouteKind kind, RouteProfile profile) external payable returns (RouteAmounts memory amounts) {
        require(!forwardingPaused, "routing paused");
        require(msg.value > 0, "amount=0");
        require(recruiterRewardsVault != address(0), "recruiterVault=0");
        require(communityRewardsVault != address(0), "communityVault=0");
        require(protocolRevenueVault != address(0), "protocolVault=0");

        amounts = previewRoute(msg.value, kind, profile);

        if (amounts.league != 0) {
            _sendValue(activeVault, amounts.league, true);
        }
        if (amounts.recruiter != 0) {
            _sendValue(recruiterRewardsVault, amounts.recruiter, true);
        }
        if (amounts.airdrop != 0) {
            (bool ok, ) = communityRewardsVault.call{value: amounts.airdrop}(
                abi.encodeWithSelector(ICommunityRewardsVault.depositAirdrop.selector)
            );
            require(ok, "airdrop route failed");
        }
        if (amounts.squad != 0) {
            (bool ok, ) = communityRewardsVault.call{value: amounts.squad}(
                abi.encodeWithSelector(ICommunityRewardsVault.depositSquadPool.selector)
            );
            require(ok, "squad route failed");
        }
        if (amounts.protocol != 0) {
            _sendValue(protocolRevenueVault, amounts.protocol, true);
        }

        emit RouteExecuted(
            kind,
            profile,
            msg.value,
            amounts.league,
            amounts.recruiter,
            amounts.airdrop,
            amounts.squad,
            amounts.protocol
        );
    }

    function previewRoute(uint256 amount, RouteKind kind, RouteProfile profile) public pure returns (RouteAmounts memory amounts) {
        require(amount > 0, "amount=0");

        uint256 leagueBps;
        uint256 recruiterBps;
        uint256 airdropBps;
        uint256 squadBps;

        if (kind == RouteKind.Trade) {
            if (profile == RouteProfile.StandardLinked) {
                leagueBps = 3750;
                recruiterBps = 1250;
                squadBps = 250;
            } else if (profile == RouteProfile.StandardUnlinked) {
                leagueBps = 3750;
                airdropBps = 1500;
            } else {
                leagueBps = 3750;
                recruiterBps = 1500;
                squadBps = 250;
            }
        } else {
            if (profile == RouteProfile.StandardLinked) {
                recruiterBps = 1500;
                squadBps = 250;
            } else if (profile == RouteProfile.StandardUnlinked) {
                airdropBps = 1750;
            } else {
                recruiterBps = 1750;
                squadBps = 250;
            }
        }

        amounts.league = (amount * leagueBps) / ROUTE_BPS;
        amounts.recruiter = (amount * recruiterBps) / ROUTE_BPS;
        amounts.airdrop = (amount * airdropBps) / ROUTE_BPS;
        amounts.squad = (amount * squadBps) / ROUTE_BPS;
        amounts.protocol = amount - amounts.league - amounts.recruiter - amounts.airdrop - amounts.squad;
    }

    function setRecruiterRewardsVault(address newVault) external onlyAdmin {
        require(newVault != address(0), "vault=0");
        emit RecruiterRewardsVaultUpdated(recruiterRewardsVault, newVault);
        recruiterRewardsVault = newVault;
    }

    function setCommunityRewardsVault(address newVault) external onlyAdmin {
        require(newVault != address(0), "vault=0");
        emit CommunityRewardsVaultUpdated(communityRewardsVault, newVault);
        communityRewardsVault = newVault;
    }

    function setProtocolRevenueVault(address newVault) external onlyAdmin {
        require(newVault != address(0), "vault=0");
        emit ProtocolRevenueVaultUpdated(protocolRevenueVault, newVault);
        protocolRevenueVault = newVault;
    }

    function proposeVault(address newVault) external onlyAdmin {
        require(newVault != address(0), "vault=0");
        uint256 size;
        assembly {
            size := extcodesize(newVault)
        }
        require(size > 0, "not contract");

        pendingVault = newVault;
        pendingSince = uint64(block.timestamp);
        emit VaultProposed(newVault, uint64(block.timestamp) + upgradeDelay);
    }

    function acceptVault() external onlyAdmin {
        address newVault = pendingVault;
        require(newVault != address(0), "no pending");
        require(pendingSince != 0, "no pending");
        require(block.timestamp >= pendingSince + upgradeDelay, "delay");

        address old = activeVault;
        activeVault = newVault;

        pendingVault = address(0);
        pendingSince = 0;

        emit VaultActivated(old, newVault);
    }

    function setForwardingPaused(bool paused) external onlyAdmin {
        forwardingPaused = paused;
        emit ForwardingPaused(paused);
    }

    function _forward(uint256 amount) internal {
        if (forwardingPaused) return;
        if (amount == 0) return;

        _sendValue(activeVault, amount, false);
    }

    function _sendValue(address to, uint256 amount, bool revertOnFailure) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) {
            if (revertOnFailure) revert("route failed");
            emit ForwardFailed(to, amount);
            return;
        }
        emit Forwarded(to, amount);
    }
}
