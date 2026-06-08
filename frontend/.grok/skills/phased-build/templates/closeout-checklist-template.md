# Closeout Checklist: [Your Feature / Assignment Title]

**Linked Build Plan**: build-plan.md (approved version)
**Purpose**: This is the **immutable contract** for the plan-verifier. Every item must be independently verifiable.

---

## Phase 1: [Phase Name] — Closeout Criteria

### Frontend Deliverables
- [ ] All new/modified React components in the phase render without console errors or hydration issues in dev + production build
- [ ] All specified routes/pages are reachable and match the plan's described behavior
- [ ] API integration for every new endpoint used by this phase works for happy path + at least 2 documented error cases (manually verified or via test)
- [ ] Styling matches existing design system / Tailwind conventions used in the project
- [ ] No new TypeScript errors introduced (`npm run build` or `tsc --noEmit` passes for changed files)
- [ ] Relevant unit/component tests added where the plan required them

### Backend / Contract Deliverables
- [ ] All new API routes return correct HTTP status codes and JSON shapes as documented in the plan
- [ ] Request validation + error responses implemented for the cases listed in the plan
- [ ] Database changes (if any) have clean migrations that can be rolled back without data loss
- [ ] New business logic is covered by unit tests (minimum coverage threshold stated in plan, or "new functions have tests")
- [ ] Contract work (if in scope): methods compile, deploy successfully to testnet, and basic calls succeed with expected events
- [ ] No breaking changes to existing public API surfaces unless explicitly approved in the plan

### Cross-Team Coordination & Integration
- [ ] Frontend and Backend implementers documented all handoffs in `coordination/phase-1.md`
- [ ] End-to-end flow for the phase works when both sides are integrated (verifier will exercise this)
- [ ] Shared data contracts (request/response bodies, event formats) match exactly what was agreed in coordination file

### Documentation & Observability
- [ ] New code has clear inline documentation (JSDoc / comments on non-obvious logic)
- [ ] Any required updates to `docs/`, route maps, or README completed
- [ ] New endpoints or major functions have basic logging/metrics hooks consistent with existing patterns

### Verification Gate
- [ ] Plan Verifier has run and produced a report with **100% PASS** on every checklist item above
- [ ] No open deviations from the approved build plan for this phase

---

## Phase 2: [Name] — Closeout Criteria

(copy the structure above, customized to the actual deliverables in the build plan)

---

## Global / Final Closeout (only after all phases)

- [ ] Every phase has an independent passing verifier report
- [ ] Full end-to-end flows across all phases work as described in the original idea
- [ ] No regressions in existing critical user flows (verifier will spot-check)
- [ ] All temporary scaffolding / debug code removed
- [ ] Final clean build + typecheck + lint on the whole project

**Note to Verifier**: Only mark this section complete after every individual phase has already been signed off.
