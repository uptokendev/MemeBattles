# Solana launchpad Address Lookup Table

User CREATE / BUY / SELL send Versioned Transactions. They require one pre-created
static Address Lookup Table. Graduation keeps its own operator table
(`SOLANA_GRADUATION_ALT_ADDRESS`) and may extend that table; user flows never extend.

## Env

| Where | Name | Notes |
|---|---|---|
| Coolify frontend | `VITE_SOLANA_LAUNCHPAD_ALT_ADDRESS` | Vite-baked. Rebuild the frontend after setting. |
| GitHub Actions variable | `SOLANA_LAUNCHPAD_ALT_ADDRESS` | Readonly CI verification. |
| Operator scripts | `SOLANA_LAUNCHPAD_ALT_ADDRESS` | Same address as Coolify. |

Production Mainnet table, verified 2026-08-20:

`AoX2EzL4i2Zb62LjsGU9xWKXbjG9CU5DGH58vxFEYJev`

It contains exactly the 15 static plan addresses, is active, and is not frozen. Authority is `9YN7WY8svWoeNgegS2oq7uNDyrdcfg9UDUQR7tWpeF8H`. Do not freeze until CREATE size work is done.

CREATE / BUY / SELL fail closed until the frontend Coolify build contains:

`VITE_SOLANA_LAUNCHPAD_ALT_ADDRESS=AoX2EzL4i2Zb62LjsGU9xWKXbjG9CU5DGH58vxFEYJev`

## Create or attach

```bash
# Create a new Mainnet table and extend it with the static launchpad plan:
npm --prefix frontend run create:solana-launchpad-alt

# Attach to an address you already have, extend any missing static accounts, verify:
SOLANA_LAUNCHPAD_ALT_ADDRESS=<addr> npm --prefix frontend run create:solana-launchpad-alt

# Verify only:
node frontend/scripts/solana-launchpad-alt-plan.mjs --require-alt --alt AoX2EzL4i2Zb62LjsGU9xWKXbjG9CU5DGH58vxFEYJev

# Compile production CREATE/BUY/SELL envelopes against the live table:
node frontend/scripts/verify-live-launchpad-alt.mjs AoX2EzL4i2Zb62LjsGU9xWKXbjG9CU5DGH58vxFEYJev
```

The table holds stable non-signer infrastructure: program IDs, global config,
sysvars, token/system programs, rewards treasury, and the six reward vaults.
Campaign and wallet accounts stay out of the table.

Do not freeze the table until that list is final.
