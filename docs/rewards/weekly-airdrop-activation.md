# Weekly Airdrop Activation Runbook

The weekly airdrop code is disabled by default. Follow this order for BSC testnet first, then repeat for BSC mainnet.

## 1. Apply database migrations

Apply, in order:

1. `db/migrations/20260710_000001_reward_calculation_inputs.sql`
2. `db/migrations/20260710_000002_weekly_airdrop_automation_guards.sql`

Confirm these relations exist:

- `public.reward_calculation_inputs`
- `public.reward_batches`
- `public.reward_ledger`
- `public.reward_batch_items`
- `public.reward_audit_logs`
- `public.reward_alerts`

## 2. Test and deploy contracts

Run:

```bash
npm ci
npx hardhat compile
npx hardhat test test/WeeklyAirdropFunding.spec.ts
```

Deploy the updated contracts:

- `CommunityRewardsVault`
- `RewardDistributor`

These versions are required because funding is atomic through `CommunityRewardsVault.fundAirdropBatch(...)`.

## 3. Configure contract wiring

Use an admin/owner signer only for this one-time configuration:

```bash
COMMUNITY_REWARDS_VAULT_ADDRESS=<vault> \
REWARD_DISTRIBUTOR_ADDRESS=<distributor> \
AIRDROP_OPERATOR=<limited-operator-wallet> \
npx hardhat run scripts/configure-reward-airdrop.cjs --network bscTestnet
```

Verify on-chain:

- `vault.rewardDistributor()` equals the deployed distributor.
- `vault.airdropOperator()` equals the limited executor wallet.
- `distributor.batchOperator()` equals the vault.

Do not use the vault admin or distributor owner wallet as the recurring executor wallet.

## 4. Deploy the funding executor

Deploy `services/reward-funding-executor` as a private service.

Required executor environment:

```text
FUNDING_EXECUTOR_TOKEN=<strong-random-token>
ALLOWED_CHAIN_IDS=97
ALLOWED_COMMUNITY_REWARDS_VAULTS_97=<vault>
ALLOWED_REWARD_DISTRIBUTORS_97=<distributor>
BSC_RPC_HTTP_97=<testnet-rpc>
AIRDROP_OPERATOR_PRIVATE_KEY_97=<limited-operator-private-key>
```

The service only permits the allowlisted call:

```text
CommunityRewardsVault.fundAirdropBatch(bytes32,bytes32,uint64,uint256)
```

## 5. Configure the weekly runner

Configure the `airdrop-testnet` GitHub environment:

Secrets:

```text
REWARDS_DATABASE_URL
AIRDROP_DRAW_SEED_SECRET
REWARD_FUNDING_EXECUTOR_URL
REWARD_FUNDING_EXECUTOR_TOKEN
BSC_RPC_HTTP_97
```

Variables:

```text
AIRDROP_AUTOMATION_ENABLED=false
AIRDROP_CHAIN_ID=97
AIRDROP_WEEKLY_DISTRIBUTION_BPS=<explicit percentage in basis points>
AIRDROP_CLAIM_WINDOW_DAYS=7
COMMUNITY_REWARDS_VAULT_ADDRESS_97=<vault>
REWARD_DISTRIBUTOR_ADDRESS_97=<distributor>
```

Keep `AIRDROP_AUTOMATION_ENABLED=false` during initial testing.

## 6. Run a dry run

From GitHub Actions, run **Weekly Airdrop** manually with:

- `dry_run=true`
- `chain_id=97`

Confirm:

- both trader and creator candidate sets are non-empty;
- exclusions and cooldowns are applied;
- winners are deterministic for the same epoch and draw secret;
- total payouts equal the configured weekly pool;
- no database rows or transactions are created.

## 7. Run one live testnet epoch

Set the testnet environment variable:

```text
AIRDROP_AUTOMATION_ENABLED=true
```

Run the workflow manually with:

- `dry_run=false`
- `chain_id=97`

Verify:

1. One trader and one creator batch exist for the epoch.
2. Both batches move from `funding_check` to `claim_open`.
3. Ledger rows move from `approved` to `claimable` only after on-chain verification.
4. The vault balance decreases by the exact funded amount.
5. The distributor contains the expected Merkle root, total funding and deadline.
6. A selected test wallet can execute a real claim.
7. Re-running the workflow creates no duplicate batch, ledger row or on-chain batch.

## 8. Enable the Monday schedule

Only after the testnet claim and retry test pass:

1. Repeat deployment and wiring for chain `56`.
2. Configure the `airdrop-production` environment.
3. Set repository variable `AIRDROP_AUTOMATION_ENABLED=true`.

The workflow runs every Monday at `00:15 UTC`.

## Emergency stop

Any one of these stops new automated rewards:

- Set repository variable `AIRDROP_AUTOMATION_ENABLED=false`.
- Set `vault.airdropOperator(address(0))`.
- Pause the affected distributor batch.
- Stop the funding executor service.

A failed funding operation remains in `funding_check`; wallets are not marked claimable until the funded batch has been verified on-chain.
