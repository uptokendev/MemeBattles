# MemeWarzone Frontend

The MemeWarzone web application and API gateway for the BNB and Solana launch, trading, security, rewards and graduated-market flows.

The frontend is maintained directly in this repository and does not require external visual-builder tooling.

## Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS and shadcn/ui
- Express API routes
- PostgreSQL/Supabase
- ethers for EVM integrations

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

The hybrid development command starts the frontend and local API gateway. Environment values are loaded through the project environment files and deployment platform configuration.

## Common commands

```bash
npm run build
npm run lint
npm run api:start
npm run worker:contract-sync
npm run worker:creator-funding
```

## Deployment

Frontend and API services are deployed through the project-controlled GitHub, Netlify and Railway pipelines. Deployment configuration, secrets and chain RPC settings must remain outside client bundles.

## Repository rules

- Keep security checks fail-closed.
- Never expose service-role credentials or signing keys to the browser.
- Keep BNB and Solana chain configuration explicit.
- Run the relevant build, lint, contract and route tests before merging.
