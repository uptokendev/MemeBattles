# MemeBattles Docs Site (Framework)

This folder is a **standalone GitBook-like docs frontend** meant to be deployed to a separate Vercel project (Option A), e.g. `docs.memebattles.gg`.

## Local dev

```bash
cd docs-site
npm i
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Add/edit pages (no database)

All docs pages are **markdown** files in:

- `src/content/**.md`

Add your page to the sidebar in:

- `src/content/sidebar.ts`

Routes match markdown paths:

- `src/content/how-it-works/graduation.md` → `/how-it-works/graduation`

## Vercel

Create a new Vercel project with:

- Root Directory: `docs-site`
- Build command: `npm run build`
- Output: `dist`

`vercel.json` provides SPA rewrites so deep links work.
