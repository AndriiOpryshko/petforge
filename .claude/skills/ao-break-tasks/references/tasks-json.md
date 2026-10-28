# `tasks.json` - the contract with `/sdlc:implement-tasks`

`implement-tasks` (course plugin) resolves `docs/features/<slug>/tasks/tasks.json`, validates the
shape, builds a Kahn DAG from `deps`, serializes lanes and runs TDD per task. This skill writes the
same shape and adds practice fields the engine does not read.

## Shape

```json
{
  "slug": "<slug>",
  "generated_by": "ao-break-tasks",
  "prd": "PRD.ao-prd.md",
  "tasks": [
    {
      "id": "Q3",
      "title": "imperative, specific",
      "layer": "infra",
      "deps": ["M6"],
      "acs": ["AC-03"],
      "dod": "one sentence naming the commands and the observable result",
      "files_hint": ["services/core/internal/governance/adapters/postgres/queries/protocols.sql"],
      "ao_layer": "sqlc",
      "context": "governance",
      "adrs": ["0016"],
      "errors": ["governance.protocol_not_found"],
      "est": "M",
      "owner": "<TBD lead>"
    }
  ]
}
```

| Field | Read by implement-tasks | Rule |
|---|---|---|
| `slug`, `tasks` | yes | top level |
| `id` | yes | unique; `<prefix><n>` per [slicing](./slicing.md) |
| `title` | yes | imperative |
| `layer` | yes | course enum only: `migration\|domain\|infra\|app\|ports\|ui\|tests\|wiring\|docs` |
| `deps` | yes | existing ids, acyclic |
| `acs` | yes | ids from the chosen PRD §5, Stage 1 |
| `dod` | yes (task brief) | one sentence, ≥1 command |
| `files_hint` | yes (lanes) | hand-written paths only |
| `ao_layer`, `context`, `adrs`, `errors`, `est`, `owner`, `generated_by`, `prd` | no | practice fields; checked by `scripts/check-tasks.mjs` |

## `ao_layer` -> `layer`

| `ao_layer` | `layer` | Engine behaviour |
|---|---|---|
| `wiring` | `wiring` | normal |
| `migration` | `migration` | serialized lane; the engine promotes staged files - in this repo the task's DoD says `/promote-migration`, which does the same with the goose numbering and lint |
| `sqlc` | `infra` | normal; overlapping `files_hint` (same queries file) -> same lane |
| `domain` | `domain` | normal |
| `app` | `app` | normal |
| `http` | `ports` | normal; all `http` tasks of a context touch `handler.go` -> one lane via `files_hint` |
| `job` | `infra` | normal |
| `web` | `ui` | not auto-serialized; parallel unless `files_hint` overlaps |
| `e2e` | `tests` | normal |
| `docs` | `docs` | normal |

## Command detection in this repo

The engine's cascade finds no Makefile; `package.json` scripts are per workspace. Recommend in the
handoff that `.claude/sdlc.local.md` sets `cmd_test_unit: "mise run test"`, `cmd_lint: "mise run
lint"`, `cmd_vet: "mise run gen:check"` so the per-task gate matches "green" minus e2e.

## Markdown twin

Each task file's frontmatter carries the same keys with the same values (`id`, `title`, `layer`,
`ao_layer`, `context`, `deps`, `acs`, `adrs`, `errors`, `files_hint`, `est`, `owner`, `status`).
The checker compares ids and `deps` of every `tasks/*.md` (except `_epic.md`, `tracker.md`) with
`tasks.json`.
