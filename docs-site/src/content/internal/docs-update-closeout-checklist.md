---
title: Docs Update Closeout Checklist
description: Final release gate for the docs shell, canonical routes, artifacts, and reward-system coverage.
---

## Mission gate

- Build passes with `npm run build`
- Deep-link smoke passes with `npm run test:deeplinks`
- No nested route serves a crawler-only `index.html`
- Every shared route loads the React shell

## Route control

- Every canonical sidebar route resolves to one markdown page
- Every alias resolves to one canonical page
- Duplicate sidebar titles fail validation
- Duplicate sidebar routes fail validation

## Artifact control

- `sitemap.xml` is generated from canonical pages only
- `docs-feed.xml` is generated from canonical pages only
- `dist/index.html` remains the only application shell entry point
- Netlify fallback remains `/* /index.html 200`
- Netlify publish directory remains `dist`

## Shell control

- Top bar loads on cold links
- Desktop sidebar loads on cold links
- Mobile menu opens on cold links
- Table of contents renders on long pages
- Previous and next navigation renders on canonical pages
- Public assets load on nested routes

## Link control

- Internal docs links stay inside React Router
- External links open as external links
- Legacy aliases land on the canonical page

## Content control

- Fee routing pages stay aligned with the current 2% envelope
- Recruiter, Squad Pool, Airdrops, and claim wording remain consistent
- Fact matrix stays current for public deployment sensitive claims
- Internal review pages stay out of the public sidebar
