# Reward Claim Launch Handoff

This is the launch-safe handoff for BNB rewards. It keeps Solana ledger-only until a Solana vault/program is reviewed separately.

## Safe local checks

From the repository root on Windows PowerShell:

```powershell
npm run compile:frontend-abis
```

This compiles contracts and syncs frontend ABIs. It does not deploy anything.

Then from the frontend folder:

```powershell
cd frontend
npm run build
```

## Deploy BNB distributor

Only run this when ops is ready to deploy:

```powershell
npm run deploy:reward-distributor:bsc-testnet
```

Optional owner override in PowerShell:

```powershell
$env:REWARD_DISTRIBUTOR_OWNER="0xYourOpsSafe"
npm run deploy:reward-distributor:bsc-testnet
```

The script prints JSON with `contract`, `address`, `owner`, `deployer`, `network`, and `chainId`. Store the address in the launch environment as the active BNB reward distributor.

Recommended env names:

```text
BNB_TESTNET_REWARD_DISTRIBUTOR_ADDRESS=0x...
BNB_REWARD_DISTRIBUTOR_ADDRESS=0x...
REWARD_DISTRIBUTOR_ADDRESS_BNB=0x...
REWARD_DISTRIBUTOR_ADDRESS=0x...
```

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
  "status": "published",
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

Amounts are integer wei. For Solana rewards, keep them ledger-only and do not send them to the BNB distributor.

## Automatic Merkle metadata

When a BNB-chain reward batch is inserted with `claimable` recipients, the API now generates claim metadata automatically.

Batch metadata receives:

```json
{
  "claimMode": "reward_distributor_merkle",
  "claimContract": "RewardDistributor",
  "contractBatchId": "0x...",
  "merkleBatchId": "0x...",
  "merkleRoot": "0x...",
  "merkleRecipientCount": 1,
  "merkleTotalAmount": "100000000000000000",
  "claimDeadline": 0
}
```

Each claimable ledger item receives:

```json
{
  "claimMode": "reward_distributor_merkle",
  "claimContract": "RewardDistributor",
  "contractBatchId": "0x...",
  "merkleRoot": "0x...",
  "merkleProof": [],
  "claimAmount": "100000000000000000"
}
```

The leaf matches the `RewardDistributor` contract:

```solidity
keccak256(bytes.concat(keccak256(abi.encode(wallet, amount))))
```

The pair hashing is compatible with OpenZeppelin's commutative Merkle proof verification.

## On-chain claim batch

After the prepared batch is created, use the batch metadata to fund the distributor:

- `contractBatchId` as the on-chain batch id
- `merkleRoot` as the on-chain root
- `merkleTotalAmount` as the total BNB funding amount
- `claimDeadline` as the deadline, or `0` for no deadline

The contract call is:

```solidity
createBatch(bytes32 batchId, bytes32 merkleRoot, uint64 claimDeadline)
```

with `msg.value` equal to `merkleTotalAmount`.

## Claim flow

The Rewards / Claims page:

1. Reads claimable rows from `reward_ledger`.
2. Creates a claim intent through `/api/rewards/me/claim-intent`.
3. Calls `RewardDistributor.claim(batchId, amount, proof)` from the connected BNB wallet.
4. Records confirmed tx hashes or failed claim errors through `/api/rewards/me/claim-record`.
5. Refreshes the claims UI.

Solana claim attempts remain disabled and should show a clear message.

## Public claim record callback

After the wallet transaction resolves, the frontend should call:

```http
POST /api/rewards/me/claim-record
```

Claim completed:

```json
{
  "rewardLedgerIds": ["reward-ledger-uuid"],
  "walletAddress": "0x...",
  "txHash": "0x...",
  "claimIntentId": "claim-..."
}
```

Claim failed:

```json
{
  "rewardLedgerIds": ["reward-ledger-uuid"],
  "walletAddress": "0x...",
  "status": "failed",
  "claimError": "RPC reverted or tx failed",
  "claimIntentId": "claim-..."
}
```

This public callback updates `reward_ledger`, linked `reward_batch_items`, pending-claim metadata, and `reward_audit_logs` for the connected wallet.

## Pending claim tracking

When a wallet creates a claim intent, the linked batch metadata now receives:

```json
{
  "claimPendingCount": 1,
  "claimPendingAmount": "100000000000000000",
  "lastClaimStatusRefreshAt": "2026-07-06T21:00:00.000Z"
}
```

When the claim is recorded as `claimed` or `failed`, these fields are recalculated from the linked ledger and batch item statuses. Admin batch responses also expose the same values at the top level where the batch helper is used.

## Ledger callbacks after payout

Ops can also close out claims through the internal callback.

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

Callbacks update `reward_ledger`, linked `reward_batch_items`, batch counts, pending-claim metadata, and `reward_audit_logs`.

## Launch guardrails

- Claims are only initiated from the Rewards / Claims page.
- Warzone Airdrops remains visibility-only.
- Solana rewards may be tracked in the ledger, but Solana claiming stays disabled.
- No reward should become claimable unless it has a `reward_ledger` entry.
- No duplicate airdrop fee is created. Use the existing airdrop allocation and show only the prize pool publicly.
