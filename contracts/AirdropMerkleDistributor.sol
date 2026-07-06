// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Native BNB Merkle distributor for weekly MemeWarzone airdrop epochs.
/// @dev Leaves Solana claiming out of scope. Solana must use a separate audited vault/program.
contract AirdropMerkleDistributor is Ownable, Pausable, ReentrancyGuard {
    error EpochExists(uint256 epochId);
    error EpochMissing(uint256 epochId);
    error InvalidRoot();
    error InvalidAccount();
    error InvalidAmount();
    error InvalidFunding(uint256 expected, uint256 actual);
    error InvalidProof();
    error AlreadyClaimed(uint256 epochId, uint256 index);
    error EpochExpired(uint256 epochId);
    error EpochNotExpired(uint256 epochId);
    error TransferFailed();

    struct Epoch {
        bytes32 merkleRoot;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint64 createdAt;
        uint64 expiresAt;
        bool exists;
        bool recovered;
    }

    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(uint256 => uint256)) private claimedBitMap;

    event EpochCreated(uint256 indexed epochId, bytes32 indexed merkleRoot, uint256 totalAmount, uint64 expiresAt);
    event Claimed(uint256 indexed epochId, uint256 indexed index, address indexed account, uint256 amount);
    event UnclaimedRecovered(uint256 indexed epochId, address indexed to, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function createEpoch(uint256 epochId, bytes32 merkleRoot, uint256 totalAmount) external payable onlyOwner {
        createEpoch(epochId, merkleRoot, totalAmount, 0);
    }

    function createEpoch(uint256 epochId, bytes32 merkleRoot, uint256 totalAmount, uint64 expiresAt) public payable onlyOwner {
        if (epochs[epochId].exists) revert EpochExists(epochId);
        if (merkleRoot == bytes32(0)) revert InvalidRoot();
        if (totalAmount == 0) revert InvalidAmount();
        if (msg.value != totalAmount) revert InvalidFunding(totalAmount, msg.value);

        epochs[epochId] = Epoch({
            merkleRoot: merkleRoot,
            totalAmount: totalAmount,
            claimedAmount: 0,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            exists: true,
            recovered: false
        });

        emit EpochCreated(epochId, merkleRoot, totalAmount, expiresAt);
    }

    function claim(
        uint256 epochId,
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external nonReentrant whenNotPaused {
        Epoch storage epoch = epochs[epochId];
        if (!epoch.exists) revert EpochMissing(epochId);
        if (epoch.expiresAt != 0 && block.timestamp > epoch.expiresAt) revert EpochExpired(epochId);
        if (account == address(0)) revert InvalidAccount();
        if (amount == 0) revert InvalidAmount();
        if (isClaimed(epochId, index)) revert AlreadyClaimed(epochId, index);

        bytes32 node = keccak256(bytes.concat(keccak256(abi.encode(index, account, amount))));
        if (!MerkleProof.verifyCalldata(merkleProof, epoch.merkleRoot, node)) revert InvalidProof();

        _setClaimed(epochId, index);
        epoch.claimedAmount += amount;

        (bool ok, ) = payable(account).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Claimed(epochId, index, account, amount);
    }

    function hasClaimed(uint256 epochId, uint256 index) external view returns (bool) {
        return isClaimed(epochId, index);
    }

    function isClaimed(uint256 epochId, uint256 index) public view returns (bool) {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        uint256 claimedWord = claimedBitMap[epochId][claimedWordIndex];
        uint256 mask = (1 << claimedBitIndex);
        return claimedWord & mask == mask;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function recoverUnclaimed(uint256 epochId, address to) external onlyOwner nonReentrant returns (uint256 recoveredAmount) {
        Epoch storage epoch = epochs[epochId];
        if (!epoch.exists) revert EpochMissing(epochId);
        if (to == address(0)) revert InvalidAccount();
        if (epoch.expiresAt == 0 || block.timestamp <= epoch.expiresAt) revert EpochNotExpired(epochId);
        if (epoch.recovered) revert EpochExpired(epochId);

        recoveredAmount = epoch.totalAmount - epoch.claimedAmount;
        epoch.recovered = true;

        if (recoveredAmount > 0) {
            (bool ok, ) = payable(to).call{value: recoveredAmount}("");
            if (!ok) revert TransferFailed();
        }

        emit UnclaimedRecovered(epochId, to, recoveredAmount);
    }

    function _setClaimed(uint256 epochId, uint256 index) private {
        uint256 claimedWordIndex = index / 256;
        uint256 claimedBitIndex = index % 256;
        claimedBitMap[epochId][claimedWordIndex] = claimedBitMap[epochId][claimedWordIndex] | (1 << claimedBitIndex);
    }
}
