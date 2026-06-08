# phased-build

Full multi-agent phased delivery system for Grok.

**Entry point**: `/phased-build <idea.md>`

See [USAGE.md](./USAGE.md) for complete documentation.

## What You Get

- Architect agent that produces high-quality phased plans + closeout checklists from vague ideas
- Two specialized paired implementers (Frontend + Backend/Contract) that must coordinate
- A ruthless Plan Verifier that only signs off when the implementation matches the approved plan and checklist 100%
- Full audit trail of every round of verification + fixes

## Quick Command

```bash
/phased-build docs/your-feature-idea.md
```

## Directory

- `SKILL.md` — Main orchestrator
- `personas/` — The four specialized agent instruction files
- `templates/` — Skeleton documents the architect can use as reference
- `examples/` — Sample idea documents
- `USAGE.md` — Detailed user guide

This skill was created for the MemeWarzone project but is general enough to use anywhere.
