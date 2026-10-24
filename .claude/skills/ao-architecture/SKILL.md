---
name: ao-architecture
description: >
  Standalone Software Architecture Document writer for features of a Go + React modular monolith
  (housing associations / OSBB and similar). Same flow as the course sdlc:architecture-design -
  gate, upstream read, repo scan, bootstrap, in-memory draft, per-section Socratic walk with
  incremental commits, blast-radius ADR gate, clean-context critic - with a fourth gate criterion
  («touches the database»), ADRs in the repo's docs/adr format with a mandatory Blast radius,
  Migration and Links block, a bounded-context ownership table and recommended containers in §5,
  and the ao-prd PRD's error catalogue, migration plan, RBAC and state machine as inputs. Runs
  without the sdlc plugin. Writes docs/features/<slug>/sad.md + adr/ (or sad.ao-architecture.md +
  adr.ao-architecture/ next to a SAD from another skill). Triggers on "/ao-architecture <slug>",
  "ao-architecture for <slug>", "SAD for <slug> in the monolith", "архітектура фічі ОСББ",
  "SAD для правління".
argument-hint: "<slug> [--depth=easy|medium|hard]"
---

# ao-architecture

Turns an approved PRD into an Arc42 SAD with C4 L1/L2 and the ADRs that matter. Parallel to
`sdlc:architecture-design`, not a replacement: it keeps the same 7-step protocol, the 4-state
Socratic machine and the per-section commits, and changes the gate, the ADR format, the §5 defaults
and the inputs (see "What differs from sdlc:architecture-design").

Shared mechanics are copied into `references/shared/` so the skill runs without the plugin:
[socratic loop](./references/shared/socratic-loop.md) · [critic](./references/shared/critic.md) ·
[ask style](./references/shared/ask-style.md) · [depth](./references/shared/interview-depth.md) ·
[size](./references/shared/size-matrix.md) · [surfaces](./references/shared/surfaces.md) ·
[diagram presentation](./references/shared/diagram-presentation.md) ·
[mermaid check](./references/shared/mermaid-check.md).

## Audience

The tech lead answers; the board chair is asked only about §10 quality goals and §11 risk
severity. Questions in Ukrainian, plain words, every term glossed once
([ask-style](./references/shared/ask-style.md)). Every option says what the skill will do next and
which ADR it would create.

## Inputs

- `<slug>`.
- **Gate:** `docs/features/<slug>/PRD.md` with `status: Approved` or `accepted`. Missing -> «run
  `/ao-prd <slug>` or `/sdlc:write-prd <slug>` first». A `Draft` PRD -> stop and ask to approve it.
  If both `PRD.md` and `PRD.ao-prd.md` are approved, ask which one to design from.
- `docs/features/<slug>/CONTEXT.md` `## Glossary` - canonical roles and terms.
- Repo: `CLAUDE.md`, `docs/adr/*.md`, `docs/architecture-map.md` if present, `mise.toml`,
  `infra/compose.yaml`, `services/*/internal/`.
- Optional `.size` (absent -> M, said in the handoff) and `--depth`.

## Output and collision rule

- `docs/features/<slug>/sad.md` from [`./templates/sad-template.md`](./templates/sad-template.md)
  (frontmatter `skill: ao-architecture`) and ADRs in `docs/features/<slug>/adr/`.
- If `sad.md` exists and its `skill:` is not `ao-architecture` (for example from
  `sdlc:architecture-design`), never touch it or its `adr/`: write `sad.ao-architecture.md` and
  `adr.ao-architecture/`, with ADR links pointing at `../sad.ao-architecture.md`. This is how the two
  skills are compared on one feature.

## Protocol

1. **Gate, size, depth.** Check the PRD gate above. Read `.size`. One depth `AskUserQuestion`
   unless `--depth` was passed ([depth](./references/shared/interview-depth.md)).
2. **Read upstream.** PRD §1 ¶4 overrides, §2, §3, §6 NFR, §6.1, §7, §8; from an ao-prd PRD also
   §5.1 error catalogue, §9 migration plan, §10 RBAC and state machine. Glossary wins over
   everything.
3. **Repo context.** Read `docs/architecture-map.md` if fresh. Otherwise one `Explore` subagent:
   versions, `services/*/internal/` contexts and their `module.go` exports, `docs/adr/`,
   depguard rules, `infra/compose.yaml` services, web routes and `src/features/`. Then read
   [`./references/repo-practice.md`](./references/repo-practice.md) and reconcile it with what the
   scan found (the repo wins).
4. **Bootstrap.** Copy the template to the collision-rule path, patch frontmatter, commit
   `<slug>: bootstrap sad from PRD and repo scan`.
5. **Draft §1-§12 in memory** per [`./references/draft-generation.md`](./references/draft-generation.md):
   recommended containers and the context-ownership table in §5, one §6 flow per critical PRD
   state transition, §8 from repo defaults + PRD §5.1 / §10.
6. **Socratic walk, gate, per-section commit.** §1 -> §12, per
   [`./references/socratic-loop.md`](./references/socratic-loop.md). §4 opens with the target-surface
   decision, then the strategic pillars; each pillar cites a §2 constraint, a repo ADR or a past
   incident. On every Approved decision score the **four** criteria
   ([`./references/blast-radius-heuristic.md`](./references/blast-radius-heuristic.md)) and spawn an
   ADR from [`./templates/adr-template.md`](./templates/adr-template.md) on 2 of 4 or data +
   irreversible. Confirm §3 and §5 diagrams in prose after validating them
   ([mermaid check](./references/shared/mermaid-check.md),
   [C4 syntax](./references/c4-mermaid-syntax.md)). A section may be marked
   `<!-- N/A: reason -->` as a deliberate choice: ask once, log it, never for §3, §4, §5, §9, §11.
   After each section write it with its ADRs and commit `<slug>: sad §N — <summary>`.
7. **Critic and finalize.** One clean-context `general-purpose` agent with
   [`./references/critic-prompt.md`](./references/critic-prompt.md) (F1-F6 + F7 for context
   boundaries, data gate, state-machine coverage, error catalogue, repo-ADR conflicts and ADR
   links), dispatched per [`./references/critic-phase.md`](./references/critic-phase.md). Resolve each
   finding with `AskUserQuestion`. Scan: every Mermaid block parses, ADR file names in decision form,
   every ADR has `Blast radius` and three `Links`, §9 closed against the ADR folder, no `<placeholder>`
   left. Commit `03: SAD + ADR for <slug> via ao-architecture`. Handoff: review `sad.md` §4, §5,
   §9 and the ADRs; next `/sdlc:complete-sequence-diagrams <slug>` or
   `/sdlc:generate-data-model <slug>`.

## What differs from sdlc:architecture-design

| Step | sdlc:architecture-design | ao-architecture |
|------|--------------------------|-----------------|
| Gate | `PRD.md` exists | PRD approved; picks between `PRD.md` and `PRD.ao-prd.md` |
| Inputs | PRD + map | + ao-prd §5.1, §9, §10; + repo ADRs `docs/adr/`; + `repo-practice.md` |
| Blast radius | 3 criteria, 2 of 3 | 4 criteria (+ «touches the database»), 2 of 4 or data + irreversible |
| ADR format | MADR, `Status: Accepted` | repo `docs/adr` shape; mandatory `Blast radius`, `Migration and rollback`, three `Links` (PRD US/AC, SAD §N, related ADR) |
| ADR naming | decision-form kebab | same, plus title `NNNN <decision sentence>` and repo-ADR links |
| §5 | free container list | recommended containers (web, core with nested contexts, db, files, otel, ai) + context-ownership table + new-context wiring checklist |
| §6 | primary flows | one flow per critical PRD state transition, each naming its AC |
| §8 | repo defaults | repo defaults + PRD §5.1 error codes + PRD §10 RBAC |
| N/A | allowed by size | deliberate N/A asked and logged; forbidden for §3, §4, §5, §9, §11 |
| Critic | `sdlc:critic` | self-contained prompt with F7 |
| Commits | `feat(<slug>): sad §N` | `<slug>: sad §N`; final `03: SAD + ADR for <slug> via ao-architecture` |
| Output | overwrites `sad.md` | `sad.ao-architecture.md` + `adr.ao-architecture/` next to another skill's SAD |

## Definition of Done

Full list: [`./references/checklist.md`](./references/checklist.md). Non-negotiable:

- SAD at the collision-rule path; 12 sections filled or deliberate `<!-- N/A: reason -->`;
  `target_surfaces` and `contexts` filled.
- §3 `C4Context` and §5 `C4Container` real and parsing; §5 has the context-ownership table.
- Every ADR: decision-form name, `status: accepted`, four-criteria `Blast radius`, `Migration and
  rollback` when data is touched, three `Links`. §9 closed against the ADR folder; 5-12 ADRs for M.
- §10 numbers verbatim from PRD §6. §11 has every Save-as-OQ with owner and due.
- One commit per section; final commit message as above; critic ran and every finding is resolved.

## Anti-patterns

- A data-shape decision (new table, migration of existing rows, retention) without an ADR.
- One context reading another's tables, or importing its sub-packages, in §5 or §6.
- Re-deciding a repo ADR (stack, contexts, codegen, migrations) without naming it as superseded.
- A strawman option the repo already excludes (another database, another language).
- An ADR without the PRD AC that triggered it, or without a related ADR in `Links`.
- Returning to a written section, or one big commit at the end.
- Overwriting a SAD written by another skill.
