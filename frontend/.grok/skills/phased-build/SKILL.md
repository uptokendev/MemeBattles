---
name: phased-build
description: >
  Full phased build system: Architect creates detailed build plans + closeout checklists from an idea .md file.
  Frontend + Backend/Contract implementers execute phases while coordinating.
  Plan Verifier acts as the impartial gate that only signs off when reality exactly matches the approved plan and every checklist item passes.
  Supports phase-by-phase or full-run execution with strict verifier loops until clean closeout.
when-to-use: Use when the user wants to run a structured, verifiable, multi-phase implementation from a high-level idea. Trigger with "/phased-build path/to/idea.md" or "run phased-build on this feature request".
argument-hint: "<path to idea.md> [phase N] [--full]"
---

# Phased Build Skill (Architect + Paired Implementers + Verifier Gate)

You are the orchestrator for a rigorous, plan-driven development workflow. You never implement, review, or verify code yourself. All substantive work is performed by specialized subagents using the personas in the `personas/` directory next to this file.

## Core Philosophy
- The **approved build plan + closeout checklist** are the single source of truth.
- The **plan-verifier** persona is the only agent allowed to declare a phase (or the whole effort) complete.
- Frontend and Backend/Contract implementers must coordinate explicitly and stay inside the plan.
- Loops continue until the verifier reports a clean closeout against the written checklist.

## Tool-Call Discipline (Strict — Same as Implement/Design Skills)
Every claim that a subagent "is starting", "has been launched", "will now review", etc. **must** be immediately preceded by the actual `spawn_subagent` (or `get_command_or_subagent_output`) tool call in the same assistant response.

Never end a turn with prose describing a launch that did not have a corresponding tool call in that response. Past-tense summaries are only allowed after you have received the tool result containing the `subagent_id`.

## Persona Files
Resolve these once at startup (use the absolute path to this SKILL.md provided by the system):
- `architect_persona` ← `personas/architect.md`
- `frontend_implementer_persona` ← `personas/frontend-implementer.md`
- `backend_implementer_persona` ← `personas/backend-implementer.md`
- `plan_verifier_persona` ← `personas/plan-verifier.md`

Always prepend the relevant persona instructions when launching a subagent for the first time. On `resume_from`, the persona is already in the transcript — do not re-inject.

## Todo Scaffold (Use Exactly These IDs)
Use `todo_write` at the very start with `merge: false`:

- `setup`
- `load-idea`
- `architect-phase`
- `plan-approval`
- `execute-phase-N` (dynamically added per phase the user requests)
- `verify-phase-N`
- `fix-loop-phase-N`
- `final-closeout-verification`
- `final-report`

Mark exactly one `in_progress` at a time. Reseed the list after any compaction.

## Setup (Step 0)
1. Generate a short unique run ID (8 hex chars).
2. Create a dedicated run directory: `.grok/runs/phased-build-${RUN_ID}/`
3. Copy the user's idea file into the run dir as `idea.md`.
4. Define persistent artifact paths inside the run dir (never /tmp):
   - `build_plan` = `.../build-plan.md`
   - `closeout_checklist` = `.../closeout-checklist.md`
   - `coordination_dir` = `.../coordination/`
   - `verifier_reports_dir` = `.../verifier-reports/`
   - `summaries_dir` = `.../summaries/`
5. Initialize state: `current_phase`, `rounds_per_phase`, `verifier_subagent_id`, `fe_subagent_id`, `be_subagent_id`, etc.
6. Load all four persona files using `read_file` and store their contents.

Announce the run directory to the user.

## Architect Phase (Step 1)
Launch a `general-purpose` subagent with the `architect` persona prepended.

Prompt must include:
- Full contents (or path) of the idea.md
- Instruction to explore the codebase first
- Exact output paths for `build_plan`, `closeout_checklist`, and a `summary_file`
- Requirement to produce both artifacts using the exact structures defined in the architect persona

Wait for completion. Save the `subagent_id` (you may resume the architect later for revisions).

Present the two generated files to the user.

## Plan Approval (Step 2)
Use `ask_user_question` (or present clearly and wait for explicit approval) with options:
- "Approve plan and checklist as-is. Proceed."
- "Request specific changes to the plan/checklist"
- "Revise with my feedback" (allow free text)

If changes are requested, resume the architect subagent with the feedback + the current plan/checklist files, and instruct it to produce revised versions + mark previous issues addressed.

Only proceed when the user explicitly approves a version. Record the approved commit or timestamp.

## Phase Execution Protocol

When the user says "execute phase 3", "run phase 1", "implement the next phase", etc.:

1. Parse the requested phase number(s) from the build plan.
2. For each requested phase:
   a. Create a phase coordination file: `coordination/phase-${N}.md`
   b. Extract the exact Frontend and Backend/Contract work items for that phase from the plan.
   c. Launch **two subagents in parallel** (`background: true`):
      - Frontend: `general-purpose` + `frontend_implementer_persona`
      - Backend: `general-purpose` + `backend_implementer_persona`
   d. Give both the full paths to:
      - Approved `build_plan`
      - `closeout_checklist`
      - Their phase-specific slice (quote it)
      - The shared coordination file for this phase
      - A summary output path for their work
   e. Instruct both that they must keep the coordination file updated and must not declare the phase done themselves — only the verifier can.
   f. Wait for both to complete (or reach a natural checkpoint they document in the coordination file).

3. After both implementers report readiness (or user manually triggers verification):
   - Launch the **plan-verifier** (new or resumed) with the verifier persona.
   - Give it the approved plan, checklist, coordination file, git diff since phase start (you can compute this), and any test/build output the user provides.
   - It must write a structured `verifier-reports/phase-${N}-round-${M}.md`

4. Read the verifier report yourself.
   - If verdict == "READY TO CLOSE" and 100% checklist items PASS → Phase complete. Record it. Move to next phase or final closeout.
   - Otherwise → Resume the relevant implementer(s) (FE, BE, or both) with the verifier report + instructions to address every failing item. Increment round counter for this phase.
   - Repeat verifier → fix until clean.

**Important**: You may run phases sequentially or (with care) in parallel if the plan says they are independent. Default is sequential.

## Final Closeout Verification
After all planned phases are marked complete by the verifier, run one final full verifier pass against the entire checklist + any cross-phase integration items.

Only when this final verifier report says everything is clean do you produce the final report.

## Final Report
Include:
- Run ID and location of all artifacts
- Approved plan + checklist versions
- Per-phase summary (rounds, key deviations addressed, verifier sign-offs)
- Total verifier rounds across the whole effort
- Any open questions or future phases noted in the original plan
- Location of the run directory (user can archive or promote the plan artifacts into `docs/`)

## Key Rules Specific to This Workflow
- Never let an implementer or the user declare a phase "done" without a passing verifier report.
- The verifier is intentionally strict and plan-literal. Support it.
- Keep excellent state so that after compaction you can resume any phase cleanly (always reseed todos + reload latest file contents).
- Support both "full run" mode and "just help me with phase 2 verification + fixes" mode.
- If the user provides an already-approved `build-plan.md` and `closeout-checklist.md` (instead of an idea), skip the architect phase and go straight to execution/approval confirmation.
- Prefer worktree isolation (`isolation: "worktree"`) for implementer subagents when the phase involves significant changes.
- All coordination between FE and BE happens through the phase coordination files + the orchestrator relaying high-level status. Do not rely on subagents talking directly to each other outside the files.

## Project-Specific Constraints (MemeWarzone)
This repository has strict local-vs-production requirements documented in `AGENTS.md` at the root.

The official private input folder for the Architect is `.grok/architect-feed/`. This folder is gitignored. When users want to feed the Architect, they should place well-written `.md` files there and invoke `/phased-build .grok/architect-feed/your-idea.md`.

The Architect persona has been updated to explicitly read `AGENTS.md` and prefer the `.grok/architect-feed/` folder as input source. The Plan Verifier must actively check compliance with the rules in `AGENTS.md` (especially no hardcoded localhost URLs and correct use of the central API layer in `src/lib/apiBase.ts`). Violating these rules is grounds for failing verification.

## Handling User Commands Mid-Run
Users will say things like:
- "Revise the plan — add a new phase for analytics"
- "Re-verify phase 2 from scratch"
- "Let the implementers keep working on phase 3, I'll trigger verification when ready"
- "Show me the current coordination file for phase 1"

Read the relevant files and respond accurately. Resume the correct subagent when appropriate.

This skill exists to make large, ambiguous assignments tractable and auditable through explicit phases, paired specialized implementers, and an incorruptible verifier gate.

Start every run by creating the todo list and the run directory. Then follow the steps above.
