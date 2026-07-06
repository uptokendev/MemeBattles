// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RewardDistributor is Ownable, Pausable, ReentrancyGuard {
    error RootZero();
    error AmountZero();
    error BatchExists(bytes32 batchId);
    error BatchMissing(bytes32 batchId);
    error BatchPaused(bytes32 batchId);
    error BatchExpired(bytes32 batchId);
    error BatchStillOpen(bytes32 batchId);
    error AlreadyClaimed(bytes32 batchId, address account);
    error InvalidProof();
    error TransferFailed();
    error InsufficientUnclaimed();

    struct Batch {
        bytes32 merkleRoot;
        uint256 totalFunded;
        uint256 totalClaimed;
        uint64 claimDeadline;
        bool paused;
        bool exists;
    }

    mapping(bytes32 => Batch) public batches;
    mapping(bytes32 => mapping(address => bool)) public hasClaimed;

    event BatchCreated(bytes32 indexed batchId, bytes32 indexed merkleRoot, uint256 totalFunded, uint64 claimDeadline);
    event BatchPaused(bytes32 indexed batchId, bool paused);
    event RewardClaimed(bytes32 indexed batchId, address indexed account, uint256 amount);
    event UnclaimedRecovered(bytes32 indexed batchId, address indexed recipient, uint256 amount);

    constructor(address initialOwner) Ownable(initialOwner) {}

    receive() external payable {}

    function createBatch(bytes32 batchId, bytes32 merkleRoot, uint64 claimDeadline) external payable onlyOwner {
        if (batchId == bytes32(0) || merkleRoot == bytes32(0)) revert RootZero();
        if (msg.value == 0) revert AmountZero();
        if (batches[batchId].exists) revert BatchExists(batchId);

        batches[batchId] = Batch({
            merkleRoot: merkleRoot,
            totalFunded: msg.value,
            totalClaimed: 0,
            claimDeadline: claimDeadline,
            paused: false,
            exists: true
        });

        emit BatchCreated(batchId, merkleRoot, msg.value, claimDeadline);
    }

    function setBatchPaused(bytes32 batchId, bool paused_) external onlyOwner {
        Batch storage batch = _batch(batchId);
        batch.paused = paused_;
        emit BatchPaused(batchId, paused_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function claim(bytes32 batchId, uint256 amount, bytes32[] calldata proof) external nonReentrant whenNotPaused {
        Batch storage batch = _batch(batchId);
        if (batch.paused) revert BatchPaused(batchId);
        if (batch.claimDeadline != 0 && block.timestamp > batch.claimDeadline) revert BatchExpired(batchId);
        if (hasClaimed[batchId][msg.sender]) revert AlreadyClaimed(batchId, msg.sender);
        if (amount == 0) revert AmountZero();

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        if (!MerkleProof.verify(proof, batch.merkleRoot, leaf)) revert InvalidProof();
        if (batch.totalFunded - batch.totalClaimed < amount) revert InsufficientUnclaimed();

        hasClaimed[batchId][msg.sender] = true;
        batch.totalClaimed += amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RewardClaimed(batchId, msg.sender, amount);
    }

    function recoverUnclaimed(bytes32 batchId, address payable recipient) external onlyOwner nonReentrant {
        Batch storage batch = _batch(batchId);
        if (batch.claimDeadline == 0 || block.timestamp <= batch.claimDeadline) revert BatchStillOpen(batchId);

        uint256 unclaimed = batch.totalFunded - batch.totalClaimed;
        if (unclaimed == 0) revert AmountZero();
        batch.totalFunded = batch.totalClaimed;

        (bool ok,) = recipient.call{value: unclaimed}("");
        if (!ok) revert TransferFailed();

        emit UnclaimedRecovered(batchId, recipient, unclaimed);
    }

    function unclaimed(bytes32 batchId) external view returns (uint256) {
        Batch storage batch = _batch(batchId);
        return batch.totalFunded - batch.totalClaimed;
    }

    function _batch(bytes32 batchId) internal view returns (Batch storage batch) {
        batch = batches[batchId];
        if (!batch.exists) revert BatchMissing(batchId);
    }
}
