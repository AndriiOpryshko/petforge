---
name: ao-prd
description: >
  Standalone PRD writer for features in small self-governed organisations (housing associations /
  OSBB, community boards) built as Go + React modular monoliths. Same flow as the course
  sdlc:write-prd - prereq check, interview front, channel pick, template draft, Socratic walk,
  clean-context critic - with a 10-section template (+ §5.1 error catalogue, §9 migration plan,
  §10 RBAC and state machine), 7 AC coverage types (adds traceability and legal competence, fed by
  the ao-discovery brief's §16 source of truth and §18 legal check), a mandatory AC per state
  transition, Go + Postgres NFR defaults and `<context>.<error_name>` error codes. Runs without
  the sdlc plugin. Writes docs/features/<slug>/PRD.md (or PRD.ao-prd.md next to a PRD from another
  skill). Triggers on "/ao-prd <slug>", "ao-prd for <slug>", "PRD for <feature> in OSBB",
  "PRD для правління", "специфікація фічі ОСББ".
argument-hint: "<slug> [--reference <path-to-context>] [--depth=easy|medium|hard]"
---

# ao-prd

Turns a confirmed idea brief into a reviewed PRD for one feature. Parallel to `sdlc:write-prd`,
not a replacement: it keeps the same protocol and gates, and changes the template, the AC
coverage contract, the defaults it proposes and three steps that do not fit an OSBB product on
this stack (see "What differs from sdlc:write-prd").

## Audience

Two people answer: the board chair (or another board member who owns the document) and the tech
lead. The chair answers §1-§5 in documents, decisions and responsibility; the tech lead answers
§5.1, §6, §9 and §10.

- Ukrainian, plain words. A technical term stays as a name, but every option explains it in one
  sentence ([`./references/ask-style.md`](./references/ask-style.md)).
- Ask about the document and the decision, not about screens.
- Every option description says what changes in the PRD and what the hidden consequence is.

## Inputs

**Hard required** (stop without them):

- `<slug>` - kebab-case.
- An idea brief with `status: Confirmed`: `docs/features/<slug>/idea-brief.ao-discovery.md` if it
  exists, else `idea-brief.md`. Missing -> «run `/ao-discovery <slug>` first».
- `docs/features/<slug>/CONTEXT.md` with a non-empty `## Glossary`. Missing -> «run `/ao-discovery`
  or `/sdlc:fix-term` first».

**Optional**:

- `--reference <path>` - a neighbouring bounded context, e.g. `services/core/internal/governance`.
  Pre-selects the reference channel in step 4.
- `docs/features/<slug>/.size` - read if present, established in step 1 if absent.
- `docs/adr/*.md` - read for constraints (§1 ¶4, §9), never cited in §5.
- `--depth=easy|medium|hard` - skips the depth question; else `interview_depth` from
  `.claude/sdlc.local.md` if it exists, else medium.

Brief sections used: §2 Problem, §3 Users, §5 Out of scope, §9 Trade-offs and edge cases,
§13 Recommendation, §15 Open questions, and from an ao-discovery brief also §16 Source of truth,
§17 Repo reference, §18 Legal and competence check. An `sdlc:interview` brief has no §16-§18: then
the traceability and legal AC types are drafted from the interview and marked as such in §1 ¶4.

## Output and collision rule

- `docs/features/<slug>/PRD.md` from [`./templates/PRD-template.md`](./templates/PRD-template.md),
  frontmatter `skill: ao-prd`, `status: Draft`.
- If `PRD.md` exists and its frontmatter `skill:` is not `ao-prd` (for example a PRD from
  `sdlc:write-prd`), never overwrite it: write `docs/features/<slug>/PRD.ao-prd.md` and say so.
  This is how the two skills are compared on one feature.
- Never set `status: Approved`. Approval is the human gate after reading the PRD.

## Protocol

### 1. Prereq check, context, size, depth (read-only)

- `test -f` the required inputs; stop with the message above if one is missing.
- Load the CONTEXT `## Glossary` as session state: roles and domain terms are canonical.
- Read the brief, [`./references/stack-defaults.md`](./references/stack-defaults.md) and
  `docs/architecture-map.md` if present.
- Size: read `.size`, or classify by [`./references/size-matrix.md`](./references/size-matrix.md),
  confirm in one `AskUserQuestion` and write `.size`.
- Depth: one `AskUserQuestion` (easy / medium / hard) per
  [`./references/interview-depth.md`](./references/interview-depth.md), unless `--depth` was passed.

### 2. Interview front (AskUserQuestion)

- Idea in 1-3 sentences, verbatim. Offer the brief's §1 wording as the first option.
- Deep dive in batches of 2-3, volume by depth. Always ask what the brief left open: which
  document states exist and who moves the document between them, which checks block and which
  only warn, which numbers the system may never write itself.

### 3. Glossary in flow

Every new or ambiguous domain term is added to `CONTEXT.md` `## Glossary` the moment it surfaces,
in the file's format (name - definition - NOT-boundary). Confirm the definition in the next
`AskUserQuestion` batch. Do not batch terms for later and do not depend on `sdlc:fix-term`.

### 4. Extra channels (multi-select AskUserQuestion)

Reference context code / project ADRs (`docs/adr/`) / other feature folders / none. Ask the exact
path for each pick. `--reference` pre-selects the first.

### 5. Read the channels

From the reference context read `domain/` (entity types, `Err...` sentinels, status constants,
`Validate()` rules), `app/` (use cases and authorization checks) and `module.go`. Record what was
found with paths; it feeds §5.1 naming, §9 and §10. Never quote code into §1-§5.

### 6. Draft §1-§10

Follow the template's `<!-- Skill instruction -->` comments and
[`./references/draft-generation.md`](./references/draft-generation.md): per-section sources, the
7 AC coverage types, one AC per §10 state transition, the error catalogue rules, the forbidden
tokens. At draft time every §4 user story already has an AC.

### 7. Socratic walk

§4 US -> §5 AC -> §5.1 error catalogue -> §6 NFR -> §7 KPI -> §9 migration -> §10 RBAC and state
machine, per [`./references/socratic-loop.md`](./references/socratic-loop.md). Two additions to
the course machine: an `Edit` that narrows a US writes the cut part into §3 Non-goals, and an AC
has an `Add edge case` option. Floors after every resolution: each of the 7 coverage types, an AC
per retained US, an AC per §10 transition, a §5.1 code per error / domain invariant / authorization
AC.

### 8. Critic, write, commit

Dispatch one clean-context critic per [`./references/critic.md`](./references/critic.md) (a
`general-purpose` agent with that prompt; `sdlc:critic` is not required). Resolve each finding with
`AskUserQuestion` (accept / amend / override -> §1 ¶4 bullet). Run the forbidden-token and
error-code scans. Write the PRD at the collision-rule path and propose the commit
`02: PRD for <slug> via ao-prd`. Then print the handoff: what was written, what to review
(§1 ¶4, §5.1, §10, new glossary terms), the human gate (set `status: Approved` by hand), and next:
`/sdlc:clarify-prd <slug>` or `/sdlc:architecture-design <slug>`.

## What differs from sdlc:write-prd

| Step | sdlc:write-prd | ao-prd |
|------|----------------|--------|
| Inputs | `idea-brief.md` 15 sections | prefers the ao-discovery brief: §16 source of truth, §18 legal check, §17 repo reference |
| Template | §1-§8 (+§6.1) | + §5.1 error catalogue, §9 migration plan, §10 RBAC matrix and state machine |
| AC types | 5 | 7: + traceability (a number cites its source), + legal competence (decision within the body's powers) |
| AC floors | type, per US | + one AC per state transition (allowed and refused), + a §5.1 code per error / invariant / authz AC |
| Socratic | 4 states, AC + «Add another AC» | US `Edit` that narrows scope writes §3 Non-goal; AC + «Add edge case» from the OSBB edge-case list |
| NFR | blank rows | Go + Postgres defaults (p95, throughput, availability, RPO, file size) to confirm or change |
| Error codes | forbidden anywhere | `<context>.<error_name>` in §5.1 only, mapped to AC and to an RFC 9457 `type`; still forbidden in §5 |
| Glossary | calls `sdlc:fix-term` | edits `CONTEXT.md` in flow itself |
| Critic | `sdlc:critic` agent | self-contained prompt; adds F7 (traceability, competence, transitions, §5.1 <-> §5, §10 <-> authz AC) |
| Output | overwrites `PRD.md` | `PRD.ao-prd.md` next to a PRD from another skill |

## Definition of Done

Full list: [`./references/checklist.md`](./references/checklist.md). Non-negotiable:

- PRD at the collision-rule path, all 10 sections (+§5.1, §6.1) filled or `<!-- N/A: reason -->`,
  `status: Draft`, `skill: ao-prd`.
- §5: every AC in Given/When/Then; all 7 coverage types; an AC per retained US and per §10
  transition; 0 forbidden tokens.
- §5.1: every code is `<context>.<error_name>` snake_case with an existing or planned context, and
  cites at least one AC.
- §4 and §10 roles exactly from the glossary.
- §6 rows numeric; §8 rows with owner and due.
- Critic ran; every finding resolved or overridden in §1 ¶4.

## Anti-patterns

- Letting a PRD state a number, date or requisite whose source §16 marks as data, as if the system
  or AI wrote it.
- An AC for a decision the board may not take, without a legal-competence AC that refuses it.
- Error codes, HTTP verbs, status numbers or table names inside §5. They live in §5.1 and later in
  `api-forge`.
- Inventing roles (`user`, `admin`) instead of glossary roles.
- A state in §10 with no AC for entering it, or a refused transition with no AC.
- Overwriting a PRD written by another skill, or setting `status: Approved` without the human.
