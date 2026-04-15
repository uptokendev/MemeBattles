# MemeWarzone Docs Update Notes

This repo keeps the original Vite/React docs structure and updates the markdown content under `src/content`.

## What changed

- Reorganized the docs flow into a cleaner reader journey:
  - Start here
  - Platform basics
  - Creators
  - Traders
  - Leagues & airdrops
  - Recruiter Program
  - Fees & treasury
  - Security & safety
  - FAQ
- Added new docs for:
  - Prepare Mode
  - Warzone Airdrop Treasury
  - Recruiter attribution and dashboard flow
  - Full League categories and epoch logic
  - War Room chat
  - Protection model
  - Treasury weekly distribution
- Removed stale placeholder pages from the navigation and content tree.
- Added route aliases in `src/content/loader.ts` so older links map to the new canonical pages.
- Added an updated `dist/` folder for direct static preview/deploy.

## Install/build

`node_modules` is intentionally not included in this zip. Run:

```bash
npm install
npm run build
```

Netlify can also build from the existing `netlify.toml`.
