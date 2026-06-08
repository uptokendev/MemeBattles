# Phased Build Skill — Usage Guide

This skill gives you a complete, auditable, multi-agent development system:
- **Architect** → turns a vague idea into a precise phased plan + measurable closeout checklist
- **Frontend Implementer** + **Backend/Contract Implementer** → paired execution with explicit coordination
- **Plan Verifier** → the incorruptible gatekeeper that only signs off when reality matches the approved plan 100%

## Quick Start

```bash
# 1. Feed the architect an idea (recommended)
/phased-build docs/my-feature-idea.md

# or from the examples
/phased-build .grok/skills/phased-build/examples/example-idea-arena-feature.md

# 2. (Alternative) Start with an already-written plan
/phased-build --plan docs/build-plan.md --checklist docs/closeout-checklist.md
```

The skill will:
1. Create a run directory under `.grok/runs/phased-build-XXXX/`
2. Run the architect (if you gave an idea)
3. Show you the generated `build-plan.md` + `closeout-checklist.md`
4. Ask for your approval
5. Let you execute phases one by one (or multiple)

## Typical Workflow

1. **Idea → Plan**
   - You write a short `.md` describing what you want (see `examples/`)
   - Run `/phased-build your-idea.md`
   - Review the plan + checklist the architect produced
   - Approve or request revisions

2. **Phase Execution**
   - `/phased-build` (while the run is active) or just keep chatting in the same session
   - Say: "Execute phase 1"
   - The two implementers will be spawned and will coordinate via the phase coordination file
   - When they are ready (or you decide), say "Verify phase 1" or "Run the verifier on phase 1"

3. **Verifier Gate**
   - The plan-verifier runs and produces a structured report
   - If anything fails the checklist → the relevant implementer(s) are automatically resumed with the report
   - Repeat until the verifier says **READY TO CLOSE**

4. **Next Phase or Done**
   - Repeat for each phase
   - Final full closeout verification at the end

## Key Commands You Can Use Mid-Run

- "Show me the current build plan"
- "Execute phase 2"
- "Verify phase 1 again from scratch"
- "Revise the plan — add a new phase for X"
- "Let the implementers work on phase 3, I'll tell you when to verify"
- "What's in the coordination file for phase 1?"
- "Run final closeout verification"

## Artifact Layout (per run)

```
.grok/runs/phased-build-abc12345/
├── idea.md                          # Your original input (copied)
├── build-plan.md                    # The approved plan
├── closeout-checklist.md            # The immutable contract for the verifier
├── coordination/
│   └── phase-1.md
│   └── phase-2.md
├── verifier-reports/
│   └── phase-1-round-1.md
│   └── phase-1-round-2.md
│   └── phase-2-round-1.md
├── summaries/
│   └── ...
└── run-metadata.json                # (future)
```

You can safely commit the final approved `build-plan.md` and `closeout-checklist.md` into `docs/` if you want permanent records.

## Tips for Best Results

- Write your initial idea.md with some context about existing patterns in the codebase.
- Keep phases small enough that a verifier can actually check them (1–4 days of work is a good size).
- The verifier is intentionally strict and literal. This is a feature, not a bug.
- You (the human) are still the ultimate approver of the plan before any code is written.
- Use worktree isolation when running implementers on risky phases (`isolation: "worktree"` is supported).

## Creating Your Own Idea Documents

Good idea documents are 1–2 pages and contain:
- Background / why this matters
- Goals (what success looks like)
- Non-goals / explicit scope boundaries
- Known constraints (tech choices, existing systems that must be used)
- Any hard requirements (security, performance, mobile, etc.)

See `examples/example-idea-arena-feature.md` for a minimal good example.

## Files in This Skill

- `SKILL.md` — The orchestrator (this is what `/phased-build` loads)
- `personas/architect.md`
- `personas/frontend-implementer.md`
- `personas/backend-implementer.md`
- `personas/plan-verifier.md`
- `templates/` — High-quality skeletons you can copy when the architect needs inspiration
- `examples/` — Sample idea documents

## Advanced / Power User

You can also invoke the personas directly (without the full orchestrator) if you want finer control:
- Spawn a subagent with the architect persona + your idea
- Manually create coordination files
- Run the verifier yourself against a specific phase

The full orchestrator is strongly recommended for anything bigger than a single small phase.

---

This system is deliberately heavyweight. It shines on medium-to-large features where "we'll just build it" usually leads to scope creep, forgotten edge cases, and "is it actually done?" ambiguity.
