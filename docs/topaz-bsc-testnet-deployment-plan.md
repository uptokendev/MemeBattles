# Authentic Topaz BSC Testnet Deployment Plan

## Decision

Deploy the official Topaz v2 AMM contracts from `topazdex/topaz-contacts` on BNB Smart Chain Testnet (chain ID 97). Do not use MemeWarzone's `MockTopazRouter`, `MockTopazFactory`, or `MockTopazPool` as the testnet dependency.

MemeWarzone only requires the Topaz v2 AMM surface used by graduation:

1. wrapped native token