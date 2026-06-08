# Architect Feed (Private / Local Only)

This folder is the **official documentation feed** for the Architect agent in the phased-build system.

## Purpose

Place high-quality `.md` files here that describe features, bugs, refactors, or technical work you want the Architect to turn into a proper phased build plan + closeout checklist.

The Architect is instructed (via its persona and `AGENTS.md`) to treat files in this folder as high-priority, well-scoped input.

## How to Use

1. Create a new `.md` file in this folder with a clear name, e.g.:
   - `add-spectator-mode.md`
   - `improve-arena-performance.md`
   - `fix-battle-state-sync-bug.md`

2. Write a good description following these guidelines:
   - Background / why this matters
   - Goals (what success looks like)
   - Explicit non-goals / out of scope
   - Known constraints (tech choices, existing systems, deployment considerations)
   - Any hard requirements around local dev vs Netlify + Railway production

3. Feed it to the Architect using the phased-build skill:

   ```bash
   /phased-build .grok/architect-feed/add-spectator-mode.md
   ```

   Or simply:
   ```bash
   /phased-build .grok/architect-feed/my-idea.md
   ```

## Important Rules

- **This folder is gitignored.** Files here will **never** be committed or pushed.
- Keep sensitive, draft, or internal-only ideas here.
- Once an idea is approved and turned into a real build plan, you can optionally move a cleaned-up version to `docs/` (public) if desired.
- The Architect will always cross-reference `AGENTS.md` at the root when reading files from this folder.

## Recommended File Structure (inside each .md)

```markdown
# Idea: [Short Title]

## Background
...

## Goals
...

## Non-Goals / Out of Scope
...

## Constraints
- Must work locally with `npm run dev`
- Must work after Netlify deploy (API calls go through Railway)
- ...

## Success Criteria
...
```

## Tips for Good Results

- Be specific about **local vs production** behavior.
- Mention any existing patterns or files the Architect should look at.
- Reference relevant parts of `AGENTS.md` if the work touches API routing, environment variables, or deployment concerns.

This folder exists so you can rapidly iterate on ideas privately before turning them into formal phased work.
