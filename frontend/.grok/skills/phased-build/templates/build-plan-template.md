# Build Plan: [Your Feature / Assignment Title]

**Idea Source**: [path to original idea .md or ticket]
**Created By**: Architect Agent (phased-build skill)
**Date**: YYYY-MM-DD
**Approved Version**: (to be filled after user approval)
**Status**: Draft

---

## Overview

[2-3 sentence summary of the overall goal and why it matters in this project.]

## Success Criteria (High Level)

- [ ] ...
- [ ] ...

## Out of Scope

- ...

---

## Phases

### Phase 1: [Clear Phase Name]

**Goal**: What this phase delivers in one sentence.

**Frontend Work** (exact list):
- Create/Modify component `src/components/Foo/Bar.tsx` with props ...
- Add page/route at `/some/path`
- Wire up state management / API client for the new endpoints
- Styling / responsive behavior per existing patterns in `global.css` + Tailwind

**Backend / Contract Work** (exact list):
- New API route(s): `POST /api/foo`, `GET /api/foo/:id` in `api/`
- Data model changes / Supabase migration in `db/migrations/`
- Business logic in `api/fooOps.js` or appropriate module
- Any contract work (if applicable): new methods on `contracts/YourContract.sol`, testnet deployment steps

**Deliverables** (what must exist at end of phase):
- Files: list the main ones
- Working end-to-end flow for the happy path of this phase
- Updated OpenAPI / route documentation if public

**Dependencies**: None (or Phase 0, or external ticket #123)

**Integration Points with Other Phases**:
- ...

**Complexity**: Low / Medium / High

---

### Phase 2: [Name]

... (repeat structure)

---

## Cross-Cutting Concerns

- Authentication / Authorization model for new surfaces
- Error handling & observability standards
- Testing strategy (unit + integration + manual verification)
- Performance / loading considerations
- Migration / rollback strategy (if data changes)

## Future Phases / Follow-ups (not in this effort)

- ...
