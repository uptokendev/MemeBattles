# Reward Claim Launch Handoff

This is the launch-safe handoff for BNB rewards. It keeps Solana ledger-only until a Solana vault/program is reviewed separately.

## Deploy BNB distributor

```bash
yarn deploy:reward-distributor:bsc-testnet
```

Optional owner override:

```bash
REWARD_DISTRIBUTOR_OWNER=0xYourOpsSafe yarn deploy:reward-distributor:bsc-testnet
```

The script prints JSON with `contract`, `address`, `owner`, `deployer`, `network`, and `chainId`. Store the address in the launch environment as the active BNB reward distributor.

## Sync ABI

```bash
yarn compile:frontend-abis
```

This writes `frontend/src/abi/RewardDistributor.json` after compile.

## Create a prepared reward batch

Use the already-mounted internal API:

```http
POST /api/internal/rewards/batches
```

Example body:

```json
{
  "rewardType": "airdrop",
  "chain": "56",
  "tokenSymbol": "BNB",
  "status": "ready",
  "source": "prepared_airdrop_ledger",
  "reason": "Prepared launch airdrop ledger import",
  "metadata": {
    "epochId": 1,
    "program": "airdrop_trader"
  },
  "recipients": [
    {
      "walletAddress": "0x0000000000000000000000000000000000000000",
      "amount": "100000000000000000",
      "status": "claimable",
      "metadata": {
        "winnerRank": 1,
        "role": "Trader"
      }
    }
  ]
}
```

Amounts are integer wei. For Solana rewards, keep status non-claimable and do not send them to the BNB distributor.

## On-chain claim batch

Create a Merkle tree with leaves matching the distributor:

```solidity
keccak256(bytes.concat(keccak256(abi.encode(wallet, amount))))
```

Create the distributor batch with the Merkle root and enough BNB funding.

## Ledger callbacks after payout

The claim worker or operator callback uses the same internal endpoint.

Claim completed:

```http
POST /api/internal/rewards/batches
```

```json
{
  "action": "claim_completed",
  "rewardLedgerId": "reward-ledger-uuid",
  "txHash": "0x...",
  "reason": "BNB distributor claim confirmed"
}
```

Claim failed:

```json
{
  "action": "claim_failed",
  "rewardLedgerId": "reward-ledger-uuid",
  "claimError": "RPC reverted or tx failed",
  "reason": "BNB distributor claim failed"
}
```

Callbacks update `reward_ledger`, linked `reward_batch_items`, batch counts, and `reward_audit_logs`.

## Launch guardrails

- Claims are only initiated from the Rewards / Claims page.
- Warzone Airdrops remains visibility-only.
- Solana rewards may be tracked in the ledger, but Solana claiming stays disabled.
- No reward should become claimable unless it has a `reward_ledger` entry.
