# Self-check

Run before the commit. The script does the mechanical part; the rest is read by eye. Every `ERROR`
is fixed in the model and both the markdown and `tasks.json` are rewritten from it - never patch
only one of them.

## Script

```bash
node .claude/skills/ao-break-tasks/scripts/check-tasks.mjs docs/features/<slug> \
  --prd PRD.ao-prd.md \
  --tasks tasks.ao-break-tasks/tasks.json      # default: tasks/tasks.json
# optional: --context CONTEXT.md (default), --json (machine output)
```

Node 24+, no dependencies. Paths after the feature folder are relative to it. Exit 0 = no `ERROR`
(warnings allowed), 1 = at least one `ERROR`, 2 = bad arguments or unreadable input.

| # | Check | Level |
|---|---|---|
| 1 | shape: `slug`, `tasks[]`; each task has `id` (unique), `title`, `layer` in the course enum, `deps[]`, `acs[]`, non-empty `dod`, non-empty `files_hint[]` | ERROR |
| 2 | every `deps` id exists | ERROR |
| 3 | acyclic (Kahn topological sort); prints phases, longest chain, parallel width | ERROR on cycle |
| 4 | `acs` ⊆ AC ids of the PRD §5; an AC deferred to Stage 2 used by a task | ERROR / WARN |
| 5 | every Stage-1 AC covered by ≥1 task (coverage table AC -> tasks) | ERROR |
| 6 | every Stage-1 error code (PRD §5.1 table ∪ CONTEXT "Sentinel errors") appears in some task's `errors`; a task `errors` code unknown to both | ERROR / WARN |
| 7 | every `ao_layer: sqlc` task's `dod` names `association_id` or says `org-filter: n/a` | ERROR |
| 8 | layer order: no task depends on a task of a later layer; in each context, `sqlc` reaches a `migration`, `app` reaches a `domain` and (if any) `sqlc`, `http` reaches an `app`, `web` reaches an `http`, `e2e` reaches a `web` or `http` - transitively through `deps` | ERROR |
| 9 | no `files_hint` entry is generated code (`.gen.go`, `sqlcgen/`, `src/api/gen/`, `routeTree.gen.ts`) | ERROR |
| 10 | `dod` names a command (`mise run`, `go test`, `pnpm`, `/roundtrip`, `/promote-migration`, `/green`) | ERROR |
| 11 | `est` is S, M, L or hours ≤ 8 | ERROR |
| 12 | `ao_layer` present and maps to `layer` per [tasks-json](./tasks-json.md) | WARN when absent, ERROR on a wrong mapping |
| 13 | each `*.md` task file next to `tasks.json` has a frontmatter `id` present in the JSON and the same `deps` set; each JSON task has a file | ERROR |

## By eye (course checks the script cannot see)

- Every task ≤1 day and one reviewable PR (≤~500 LOC); one layer, one context.
- The DAG shows the parallel branches the work allows (domain alongside migration, contexts side by side).
- DoD bullets are concrete for this task: the right command, the exact AC wording, the right status per code.
- `files_hint` names real or planned paths in the repo layout (`references/repo-practice.md`).
- Task bodies link upstream (`../PRD.ao-prd.md#ac-03`, `../sad.ao-architecture.md` §6 flow name, ADR file) and do not paste it.
- No task violates a hard rule from PRD §6 / SAD §11 / the ADRs (cross-context import, trigger
  without an ADR, cross-context FK, offset pagination).
- `_epic.md` flowchart: one `subgraph` per layer, same edges as `deps`, parses per
  [mermaid check](./shared/mermaid-check.md).
- Frontmatter of `_epic.md` says `skill: ao-break-tasks`, `prd:` names the PRD used.
