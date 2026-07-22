// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IMonthlyCapOracle {
    function nativeTargetForUsd(uint256 usdAmount) external view returns (uint256);
}

/// @notice Seals monthly league prize pools against an oracle-derived cap and routes overflow to charity.
contract MonthlyLeagueTreasury {
    uint256 public constant DEFAULT_MONTHLY_CAP_USD = 1_500_000 ether;

    struct MonthSeal {
        bool isSealed;
        bytes32 winnersRoot;
        uint256 capUsd;
        uint256 capNative;
        uint256 playerPool;
        uint256 winnerTotal;
        uint256 overflow;
        uint256 sealedAt;
    }

    address public immutable multisig;
    address public rootPoster;
    IMonthlyCapOracle public immutable oracle;
    address public immutable charityTreasury;
    uint256 public immutable monthlyCapUsd;

    mapping(uint256 => MonthSeal) public monthSeal;
    mapping(uint256 => uint256) public monthClaimedTotal;
    mapping(uint256 => mapping(bytes32 => bool)) public monthLeafClaimed;

    event RootPosterUpdated(address indexed oldRootPoster, address indexed newRootPoster);
    event MonthSealed(
        uint256 indexed monthId,
        bytes32 indexed winnersRoot,
        uint256 capUsd,
        uint256 capNative,
        uint256 playerPool,
        uint256 winnerTotal,
        uint256 overflow
    );
    event Claimed(uint256 indexed monthId, address indexed recipient, uint256 amount, bytes32 indexed leaf);
    event NativeWithdrawn(address indexed to, uint256 amount);

    error NotMultisig();
    error NotRootPosterOrMultisig();
    error ZeroAddress();
    error RootZero();
    error MonthAlreadySealed();
    error MonthNotSealed();
    error WinnerTotalAboveCap();
    error WinnerTotalAbovePlayerPool();
    error AmountZero();
    error AlreadyClaimed();
    error BadProof();
    error ClaimExceedsWinnerTotal();
    error InsufficientBalance();
    error NativeTransferFailed();

    modifier onlyMultisig() {
        if (msg.sender != multisig) revert NotMultisig();
        _;
    }

    modifier onlyRootPosterOrMultisig() {
        if (msg.sender != rootPoster && msg.sender != multisig) revert NotRootPosterOrMultisig();
        _;
    }

    constructor(address multisig_, address rootPoster_, address oracle_, address charityTreasury_, uint256 monthlyCapUsd_) {
        if (multisig_ == address(0) || oracle_ == address(0) || charityTreasury_ == address(0)) revert ZeroAddress();
        multisig = multisig_;
        rootPoster = rootPoster_;
        oracle = IMonthlyCapOracle(oracle_);
        charityTreasury = charityTreasury_;
        monthlyCapUsd = monthlyCapUsd_ == 0 ? DEFAULT_MONTHLY_CAP_USD : monthlyCapUsd_;
        emit RootPosterUpdated(address(0), rootPoster_);
    }

    receive() external payable {}

    function setRootPoster(address newRootPoster) external onlyMultisig {
        emit RootPosterUpdated(rootPoster, newRootPoster);
        rootPoster = newRootPoster;
    }

    function sealMonth(uint256 monthId, bytes32 winnersRoot, uint256 winnerTotal) external onlyRootPosterOrMultisig {
        if (winnersRoot == bytes32(0)) revert RootZero();
        if (monthSeal[monthId].isSealed) revert MonthAlreadySealed();

        uint256 capNative = oracle.nativeTargetForUsd(monthlyCapUsd);
        if (winnerTotal > capNative) revert WinnerTotalAboveCap();

        uint256 balance = address(this).balance;
        uint256 playerPool = balance > capNative ? capNative : balance;
        if (winnerTotal > playerPool) revert WinnerTotalAbovePlayerPool();

        uint256 overflow = balance - playerPool;
        monthSeal[monthId] = MonthSeal({
            isSealed: true,
            winnersRoot: winnersRoot,
            capUsd: monthlyCapUsd,
            capNative: capNative,
            playerPool: playerPool,
            winnerTotal: winnerTotal,
            overflow: overflow,
            sealedAt: block.timestamp
        });

        if (overflow != 0) {
            (bool ok, ) = payable(charityTreasury).call{value: overflow}("");
            if (!ok) revert NativeTransferFailed();
        }

        emit MonthSealed(monthId, winnersRoot, monthlyCapUsd, capNative, playerPool, winnerTotal, overflow);
    }

    function claim(
        uint256 monthId,
        bytes32 category,
        uint8 rank,
        address payable recipient,
        uint256 amount,
        bytes32[] calldata proof
    ) external {
        MonthSeal memory seal = monthSeal[monthId];
        if (!seal.isSealed) revert MonthNotSealed();
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert AmountZero();
        if (amount > address(this).balance) revert InsufficientBalance();

        bytes32 leaf = keccak256(abi.encode(monthId, category, rank, recipient, amount));
        if (monthLeafClaimed[monthId][leaf]) revert AlreadyClaimed();
        if (!MerkleProof.verify(proof, seal.winnersRoot, leaf)) revert BadProof();

        uint256 newClaimedTotal = monthClaimedTotal[monthId] + amount;
        if (newClaimedTotal > seal.winnerTotal) revert ClaimExceedsWinnerTotal();

        monthClaimedTotal[monthId] = newClaimedTotal;
        monthLeafClaimed[monthId][leaf] = true;

        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit Claimed(monthId, recipient, amount, leaf);
    }

    /// @notice Multisig-only emergency/manual withdrawal for unclaimed residuals or migration.
    function withdrawNative(address payable to, uint256 amount) external onlyMultisig {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientBalance();

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
        emit NativeWithdrawn(to, amount);
    }
}
