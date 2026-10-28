---
name: ao-break-tasks
description: >
  Standalone task-breakdown skill for features of a Go + React modular monolith (housing
  associations / OSBB and similar). Same flow as the course sdlc:break-tasks - gate PRD + SAD +
  Accepted ADR, read the artifacts, slice, dependency DAG, per-task Definition of Done, tracker,
  tasks.json, self-check, commit - rewritten for the repo's practice: vertical layers of the
  monolith (new-context wiring, goose migration via promote-migration and /roundtrip, sqlc queries,
  stdlib-only domain with sentinel errors, app use case + ports, HTTP strict-server handler with
  problem+json after merging the contract delta, River job, web route + feature component + story
  per state, Playwright e2e), one task per PRD §10 state transition, DoD lines with real commands
  (mise run gen && git diff --exit-code, mise run lint with depguard, go test with testdb.New,
  pnpm test:stories, /roundtrip, /green), the exact §5.1 error code, the AC it proves and the
  association_id org-filter check. Reads CONTEXT.md Invariants, Sentinel errors and Org-filter
  invariant and stops when they are missing. Ships a tasks.json checker (DAG, AC coverage, error
  codes, layer order, org filter, generated files). tasks.json stays consumable by
  /sdlc:implement-tasks. Runs without the sdlc plugin. Writes docs/features/<slug>/tasks/ or
  tasks.ao-break-tasks/ next to tasks from another skill. Triggers on "/ao-break-tasks <slug>",
  "ao-break-tasks for <slug>", "task breakdown for <slug> in the monolith", "задачі фічі ОСББ",
  "розбий фічу на задачі", "план робіт для правління".
argument-hint: "<slug>"
---

# ao-break-tasks

Turns a designed feature into atomic tasks of at most one day, each one reviewable PR, with a
dependency graph, a Definition of Done per task and the machine handoff `tasks.json`. Parallel to
`sdlc:break-tasks`, not a replacement: it keeps the same protocol and the same `tasks.json`
contract (so `/sdlc:implement-tasks` runs it unchanged) and changes the inputs, the slicing, the
DoD and the self-check (see "What differs from sdlc:break-tasks").

Task files **link** to upstream sections (`PRD.ao-prd.md` AC, §5.1, §10, `sad.ao-architecture.md`
§5/§6, ADRs, `data-model.md`, the contract delta); they never paste them.

Shared mechanics are copied into `references/shared/` so the skill runs without the plugin:
[size](./references/shared/size-matrix.md) · [surfaces](./references/shared/surfaces.md) ·
[mermaid check](./references/shared/mermaid-check.md) · [handoff](./references/shared/handoff.md) ·
[ask style](./references/shared/ask-style.md).

## Audience

The tech lead (here: the repo owner) answers. Questions in Ukrainian, plain words, every term
glossed once ([ask-style](./references/shared/ask-style.md)); every option says what the skill
writes next. Task files are in English like the rest of `docs/features/`.

## Inputs

- `<slug>`.
- **Gate (hard refuse)**, each in either variant:
  - PRD: `docs/features/<slug>/PRD.ao-prd.md` or `PRD.md` -> else «run `/ao-prd <slug>` first»;
  - SAD: `sad.ao-architecture.md` or `sad.md` -> else «run `/ao-architecture <slug>` first»;
  - ≥1 ADR with `status: accepted` (case-insensitive, frontmatter or a `**Status:**` line) in the
    ADR folder of the chosen set (`adr.ao-architecture/` or `adr/`) -> else «run `/ao-architecture
    <slug>` or `/sdlc:decide-adr <slug>`».
- **Artifact set.** When both variants exist, one `AskUserQuestion`: **ao set (Recommended)** -
  `PRD.ao-prd.md` + `sad.ao-architecture.md` + `adr.ao-architecture/` + `contracts.ao-api-forge/`
  (it has the §5.1 error catalogue, the §10 state machine and `x-problem-types`) / **course set** -
  `PRD.md` + `sad.md` + `adr/` + `contracts/` / **mixed** (one more question per artifact). AC ids
  differ between the two PRDs: every `acs` entry comes from the chosen PRD only. A contract whose
  `api-sync-report.md` names another PRD than the chosen one is reported as a mismatch and asked
  about before slicing.
- **Also read:** data model (`data-model.ao-data-model.md` or `data-model.md`) and the staged
  migrations (`migrations.ao-data-model/` + `MANIFEST.md`, or `migrations/` `<ts>_*.up.sql` pairs);
  the contract delta `openapi.yaml` + `api-sync-report.md` (`**Verdict:**` must be `PASS` or
  `PASS (with deferrals)`; `FAIL` -> ask: stop and reconcile / slice anyway and mark the HTTP
  tasks blocked); `events.md` when the SAD has a `worker` surface; `design-spec.md` when present
  (Figma node ids for stories); `.size` or the PRD `feature_size` (absent -> M).
- **CONTEXT.md (hard):** `docs/features/<slug>/CONTEXT.md` must carry `## Invariants`,
  `## Sentinel errors` and `## Org-filter invariant` (the fix-term five-section layout, see the
  course example). The DoD of the domain, sqlc and HTTP tasks is written from them. Missing ->
  [`./references/context-gate.md`](./references/context-gate.md): stop, or draft the sections from
  PRD §5.1, PRD §10 and the org-filter ADR and write them only after the user approves.
- **Repo (always read):** `CLAUDE.md` (layout rules, new-context wiring, commands, "green",
  gotchas, metrics log), `.claude/README.md`, `.claude/commands/{green,roundtrip}.md`,
  `.claude/skills/promote-migration/SKILL.md`, `.claude/rules/{migrations,openapi}.md`,
  `services/core/internal/*/` (what exists), `services/core/cmd/api/main.go`,
  `services/core/sqlc.yaml`, `services/core/.golangci.yml` (depguard rules), `mise.toml`,
  `apps/web/src/{routes,features,components/ui}`, `apps/web/e2e/`. Then read
  [`./references/repo-practice.md`](./references/repo-practice.md) and reconcile it with the repo
  (the repo wins; the difference goes to `_epic.md` Notes).

## Output and collision rule

- `docs/features/<slug>/tasks/`: `_epic.md` from [`./templates/_epic.md`](./templates/_epic.md),
  `tracker.md` from [`./templates/tracker.md`](./templates/tracker.md), one `<id>-<task-slug>.md`
  per task from [`./templates/task.md`](./templates/task.md), and `tasks.json` per
  [`./templates/tasks.example.json`](./templates/tasks.example.json) and
  [`./references/tasks-json.md`](./references/tasks-json.md).
- If `tasks/` exists and its `_epic.md` frontmatter is not `skill: ao-break-tasks` (or there is no
  `_epic.md`), never touch it: write `tasks.ao-break-tasks/` with the same files. This is how the two
  skills are compared on one feature. `/sdlc:implement-tasks` reads only `tasks/tasks.json`, so the
  handoff says how to swap the folders once the user picks one.

## Protocol

1. **Gate and picks.** Check the gate; pick the artifact set (one `AskUserQuestion` per real
   choice); say «found / missing» for data model, staged migrations, contract (+ verdict),
   `events.md`, `design-spec.md`, size. Read `target_surfaces` and `contexts` from the SAD
   frontmatter: `backend-service` -> backend layers, `web-frontend` -> `web` + `e2e`, `worker` ->
   `job` tasks ([surfaces](./references/shared/surfaces.md)).
2. **CONTEXT gate.** Check the three sections per [context-gate](./references/context-gate.md).
   Collect the sentinel list (CONTEXT ∪ PRD §5.1 table, Stage 1 only) and the org-filter rule
   (column, scope, ADR id).
3. **Read upstream directly.** PRD §4 stories, §5 AC (Stage 1 vs deferred), §5.1, §6 NFR, §9
   migration plan, §10 roles, transitions and refusals; SAD §4 strategy, §5 context ownership,
   internal decomposition and new-context wiring, §6 flows, §8 crosscutting, §9 ADR index, §11
   risks; each Accepted ADR; data model aggregates, query -> index map and staged migrations;
   the contract's operations (tag, `operationId`, `x-problem-types`).
4. **Slice by the repo's vertical layers** per [`./references/slicing.md`](./references/slicing.md):
   `wiring` (only when the SAD adds a context) -> `migration` -> `sqlc` -> `domain` -> `app` ->
   `http` -> `job` -> `web` -> `e2e`. One task per PRD §10 allowed transition at the `app` and
   `http` layers where the transition has its own use case; refused transitions become domain test
   rows, not tasks. Group staged migrations by aggregate; expand / backfill / contract stay
   separate tasks (separate PRs). Stage 2 ACs get no tasks; they are listed under Out in `_epic.md`.
5. **Atomic check.** Each task ≤1 day (`est` S = 2h, M = half-day, L = day; more -> split), ≤~500
   LOC, one layer, one context. A task that edits files of two contexts is split at `module.go`.
6. **Dependency graph.** `deps` follow layer order inside a context (migration before sqlc, sqlc and
   domain before app, app before http, http before web, web before e2e) and the contract (the
   first `http` task of a context merges the delta and runs `mise run gen`; later `http` tasks of
   the same context depend on it). Name the parallel branches (domain alongside migration; contexts
   alongside each other; stories alongside handlers once the hooks exist).
7. **Per-task DoD** from [`./references/dod-catalogue.md`](./references/dod-catalogue.md): concrete
   commands, the AC id the task proves, the exact `<context>.<error_name>` codes and their status
   (from §5.1 / `x-problem-types`), the org-filter line for every new query, the precise
   files. Never «tests pass», «works», «done when reviewed».
8. **Refs and files hint.** `acs` (chosen PRD ids, Stage 1), `adrs`, `errors`, `files_hint`
   (hand-written paths only; a migration task names its staged file(s) and
   `services/core/migrations/`; never `*.gen.go`, `sqlcgen/`, `src/api/gen/`, `routeTree.gen.ts`).
9. **Estimate and owner.** `est` per task; owner `<TBD lead>` unless the user names one.
10. **Write the files.** `_epic.md` with the mermaid `flowchart` grouped by layer (one `subgraph` per
    layer, same edges as `deps`), validated per [mermaid check](./references/shared/mermaid-check.md);
    `tracker.md`; task files; `tasks.json` from the same in-memory model.
11. **Self-check** per [`./references/self-check.md`](./references/self-check.md): run
    `node .claude/skills/ao-break-tasks/scripts/check-tasks.mjs docs/features/<slug>
    --prd <chosen PRD> --tasks <out>/tasks.json` (from the repo root; the script lives in the
    skill folder, reach it through the symlink) and fix every `ERROR`, then the manual checks the
    script cannot do. Paste the script's coverage summary into `_epic.md` § Self-check.
12. **Optional tracker export.** If a tracker MCP or `gh` is available, offer to create one issue
    per task from the task file (title, body = Why + DoD, labels = layer and context). Otherwise
    say the task files are copy-paste ready. Never bind to one tracker.
13. **Commit and handoff.** One commit with the output folder only:
    `06: tasks for <slug> via ao-break-tasks`. On `feature-1/*` / `feature-2/*` branches append the
    `commit` line to `LOG.md` per `CLAUDE.md` (timestamp from `date +%Y-%m-%dT%H:%M:%S%z`). Then the
    handoff block ([handoff](./references/shared/handoff.md)): *What I did* (set used, task count by
    layer, longest chain, parallel width, size, checker result), *Review* (`_epic.md`, `tracker.md`,
    `tasks.json`, the first task of each layer), *Run next*: `/clear`, then `/sdlc:plan-tests <slug>`,
    then `/sdlc:implement-tasks <slug>`; when the output went to `tasks.ao-break-tasks/`, first
    `git mv docs/features/<slug>/tasks docs/features/<slug>/tasks.sdlc && git mv
    docs/features/<slug>/tasks.ao-break-tasks docs/features/<slug>/tasks` (only if the user picks
    the ao breakdown).

## `tasks.json` and `/sdlc:implement-tasks`

The course contract is kept field for field: `{slug, tasks: [{id, title, layer, deps, acs, dod,
files_hint}]}`, `layer` from the course enum, `deps` acyclic, `dod` one sentence. The practice
lives in extra fields the engine ignores: `ao_layer`, `context`, `adrs`, `errors`, `est`, `owner`.
Mapping and engine behaviour (migration lane, ui parallelism, command detection through `mise`)
-> [`./references/tasks-json.md`](./references/tasks-json.md).

## What differs from sdlc:break-tasks

| Step | sdlc:break-tasks | ao-break-tasks |
|------|------------------|----------------|
| Gate | `PRD.md` + `sad.md` + Accepted ADR in `adr/` | either variant of each (`PRD.ao-prd.md`, `sad.ao-architecture.md`, `adr.ao-architecture/`); status match case-insensitive |
| Inputs | PRD + SAD + ADRs (+ data-model, openapi) | ask ao / course / mixed set; + §5.1 catalogue, §9, §10, staged goose migrations + MANIFEST, contract verdict, `events.md`, `design-spec.md` |
| CONTEXT.md | not read | **hard**: Invariants, Sentinel errors, Org-filter invariant; stop or draft-and-approve when missing |
| Layers | generic `migration · domain · infra · app · ports · ui · tests · wiring · docs` | repo layers `wiring · migration · sqlc · domain · app · http · job · web · e2e · docs` in `ao_layer`, mapped to the course enum in `layer` |
| Slicing | 8-20 items by size | per context and layer, one task per §10 transition at app/http, expand/backfill/contract split, Stage 2 ACs excluded |
| Migration task | staged pair, engine promotes | `/promote-migration <slug> <name>`, migration-lint hook, `/roundtrip <N>` |
| HTTP task | handler + dto + errors | merge the delta into `services/core/api/openapi.yaml`, `mise run gen`, strict-server method, sentinel -> problem+json with `code` |
| UI task | reuse primitives | orval hooks `@/api/gen/endpoints/<bc>/<bc>`, `src/routes/`, `src/features/<bc>/`, shadcn `src/components/ui`, one story per state with a11y |
| DoD | testable bullets, «lint + vet clean» | commands per layer (`mise run gen && git diff --exit-code`, `mise run lint`, `go test ./internal/<bc>/...` on `testdb.New(t)`, `pnpm --filter @spilno/web test:stories`, `/roundtrip`, `/green`) + AC id + exact error code + org filter |
| Task frontmatter | id, title, layer, deps, acs, files_hint, owner, estimate, status | + `ao_layer`, `context`, `adrs`, `errors`, `est` (S/M/L) |
| `_epic.md` DAG | flat flowchart | flowchart with one `subgraph` per layer |
| Self-check | ≤1 day, acyclic, DoD, AC coverage | + Stage-1 AC coverage, §5.1 codes used, org-filter line per query, layer order in deps, no generated files, concrete DoD - by `scripts/check-tasks.mjs` |
| Metrics | none | `LOG.md` commit line on `feature-*` branches |
| Commit | `13: task-breakdown for <slug> (breakdown + tasks.json)` | `06: tasks for <slug> via ao-break-tasks` |
| Output | `tasks/` | `tasks.ao-break-tasks/` next to tasks from another skill |

## Definition of Done

- Output folder at the collision-rule path with `_epic.md` (`skill: ao-break-tasks`), `tracker.md`,
  one file per task and `tasks.json`; markdown and JSON reflect one model (same ids, deps, acs).
- `check-tasks.mjs` exits 0: shape, deps exist, acyclic, `acs` ⊆ chosen PRD ids, every Stage-1 AC
  covered, every Stage-1 §5.1 code in some task's `errors`, every `sqlc` task with an
  `association_id` line (or `org-filter: n/a <reason>`), layer order, no generated paths, a command
  in every `dod`, `est` ≤ L.
- Every task ≤1 day, one layer, one context; the DAG shows the parallel branches the work allows.
- The `_epic.md` flowchart parses; it groups tasks by layer.
- One commit with the message above; `LOG.md` line on `feature-*` branches; handoff printed.

## Anti-patterns

- «Implement the protocol aggregate» as one task, or a task that spans migration + handler + UI.
- A `dod` without a command, or with «tests pass» as the whole check.
- A task that edits `*.gen.go`, `sqlcgen/`, `src/api/gen/` or `routeTree.gen.ts` by hand, or a
  DoD that omits `mise run gen && git diff --exit-code` after a contract or query change.
- A new sqlc query without the `association_id` filter line in its DoD.
- A §5.1 code no task maps to a status, or an error code invented outside §5.1 / CONTEXT.
- An `http` task that does not depend on the `app` task it exposes; a `web` task before the
  operation it calls exists in the merged contract.
- One task for expand + backfill + contract of an existing table (three PRs, three deploys).
- A `wiring` task missing one of the five places (spec tag, `oapi-codegen.yaml`, `sqlc.yaml`,
  depguard `<bc>-private` + its exclusion regex, `cmd/api/main.go`) or using `r.Mount`.
- Tasks for Stage 2 ACs; a story that recreates a shadcn primitive.
- Overwriting tasks written by another skill; editing CONTEXT.md without approval.
