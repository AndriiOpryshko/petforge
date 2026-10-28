# petforge

Claude Code plugin for Go + React pet projects.

## Purpose

Adding one entity to a Go modular monolith touches the same dozen places every time: migration,
OpenAPI paths and schemas, sqlc queries, domain, use cases, ports, Postgres adapter, HTTP handler,
context wiring, depguard rule, tests and API requests. Done by hand with an agent this took 13 minutes,
7 prompts and 64 agent turns for one entity. petforge generates the whole slice from a short field
spec and guards the bounded-context rules while Claude edits, so the agent only handles what is
specific to the entity.

It targets projects laid out as `services/<svc>/internal/<context>/{domain,app,ports,adapters}` with
chi + oapi-codegen (strict server), sqlc + pgx, goose and testcontainers, like
[spilno](https://github.com/AndriiOpryshko/spilno).

## Install

```sh
claude plugin marketplace add AndriiOpryshko/petforge
claude plugin install petforge@petforge
```

Or for one session from a checkout: `claude --plugin-dir path/to/petforge`.

Requirements: Node 24+ (the generator is TypeScript run natively), Go toolchain, `jq` for the hook.

Optional project config, `.claude/petforge.json` (defaults shown):

```json
{ "service": "services/core", "gen": "mise run gen", "lint": "mise run lint", "test": "mise run test", "log": "LOG.md" }
```

## Commands

| Command | What it does |
| --- | --- |
| `/petforge:slice <description>` | Runs the four skills below in order for one entity |

```
/petforge:slice Meeting in context governance: title 1..200 chars, held_at timestamp, location optional
```

## Skills

| Skill | Trigger | What it does |
| --- | --- | --- |
| `slice-plan` | "plan a slice", "add an entity", `/petforge:slice-plan <description>` | Writes `.petforge/slices/<entity>.json` (fields, types, limits, defaults, cross-field rules) and checks it against the project; no code |
| `slice-scaffold` | "scaffold the slice", `/petforge:slice-scaffold [spec]` | Runs `scripts/slice.ts scaffold`, then codegen, `go mod tidy`, build and vet; fixes hand-written code only |
| `slice-tests` | "test the slice", "add the business rules", `/petforge:slice-tests` | Runs the context's tests on a real database and implements the spec's `rules` test-first |
| `slice-ship` | "ship the slice", "run the gate", `/petforge:slice-ship` | Runs the full lint and test commands, fixes failures, writes the PR description |

Generated per entity: goose migration with CHECK constraints, OpenAPI create/get/list with cursor
pagination and problem+json errors, sqlc queries, domain type with `Validate()`, service, repository
port and Postgres adapter, strict-server handler, context `module.go`, wiring in `cmd/api/main.go`,
`sqlc.yaml` and `.golangci.yml`, domain unit tests, HTTP integration tests (201, 422 per rule, 404,
pagination, bad cursor) and three Bruno requests. Field types: `text`, `int64`, `bool`, `enum`,
`date`, `timestamptz`, each optionally nullable or defaulted.

Agent: `pattern-scout` (read-only) maps how an unfamiliar project lays out a context when the
generator's check fails.

## Hooks

| Event | Matcher | Blocks when |
| --- | --- | --- |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | the target is generated code (`*.gen.go`, `sqlcgen/`, `src/api/gen/`, `routeTree.gen.ts`) |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | Go code imports another context's sub-package (`internal/<bc>/<pkg>`) instead of its module package |
| `PreToolUse` | `Edit\|Write\|MultiEdit` | a non-test file in `internal/<bc>/domain/` imports anything outside the standard library and `github.com/google/uuid` |

A block exits 2 with the reason, which Claude reads and corrects. On `feature-<n>/*` branches each
block is also appended to the project's log file as `- <time> | F<n> | hook | blocked <file>: <reason>`.

## SDK scripts

[sdk/api-autodoc/](sdk/api-autodoc/README.md) is a Claude Agent SDK loop in Python that updates
`docs/api/<context>.md` from contract changes. Python handles the pre-check, the schema and spec
verification and the run artifacts around the agent: `make -C sdk/api-autodoc run TARGET=<project>`.

## Development

`bash scripts/validate.sh` runs every check (JSON syntax, `claude plugin validate --strict`, manifest
version sync, shell lint, tests). CI runs the same script.

Project-local skill (not shipped with the plugin): `/ao-sdlc-audit <slug>` in
[.claude/skills/ao-sdlc-audit/](.claude/skills/ao-sdlc-audit/SKILL.md) audits a feature folder for the
nine SDLC artifacts (sdlc or sdd layout) and reports which are present, missing or stale.
`/ao-discovery <slug>` in [.claude/skills/ao-discovery/](.claude/skills/ao-discovery/SKILL.md) runs a
discovery interview tuned for housing-association (OSBB) features and writes `idea-brief.md`.
`/ao-prd <slug> [--reference <context>]` in [.claude/skills/ao-prd/](.claude/skills/ao-prd/SKILL.md) is the
next step: the course `sdlc:write-prd` flow with a 10-section PRD (error catalogue, migration plan, RBAC and
state machine), traceability and legal-competence acceptance criteria fed by the ao-discovery brief, and
Go + Postgres NFR defaults. Writes `PRD.ao-prd.md` next to a PRD from another skill.
`/ao-architecture <slug>` in [.claude/skills/ao-architecture/](.claude/skills/ao-architecture/SKILL.md) follows
with the course `sdlc:architecture-design` flow: Arc42 SAD with C4 L1/L2, a four-criteria ADR gate (adds
«touches the database»), ADRs in the repo's `docs/adr` shape with Blast radius, Migration and Links blocks,
recommended containers and a bounded-context ownership table in §5. Writes `sad.ao-architecture.md` next to a
SAD from another skill.
`/ao-data-model <slug>` in [.claude/skills/ao-data-model/](.claude/skills/ao-data-model/SKILL.md) is the
course `sdlc:generate-data-model` flow rewritten for the repo's goose + sqlc practice: `data-model.md` with
context ownership, a query -> index map, an error-catalogue -> constraint map and ADR-backed deviations, plus
goose migrations (Up/Down in one file, `StatementBegin/End`, `NO TRANSACTION` for `CONCURRENTLY`) staged as
`NNNNN_*.sql` with a manifest until promote. It bootstraps a rules baseline (`uuid` + `gen_random_uuid()`,
`updated_at` trigger, `text` + length CHECK, stable-invariant CHECKs only, no cross-context FKs) and ships
Postgres 18 expand/backfill/contract templates and a `pg_dump` schema roundtrip. Writes
`data-model.ao-data-model.md` next to a data model from another skill.
`/ao-api-forge <slug> [--reconcile]` in [.claude/skills/ao-api-forge/](.claude/skills/ao-api-forge/SKILL.md) is the
contract step: the course `sdlc:api-forge` flow (scenario A/B, drift check with a verdict, `--reconcile`) producing an
OpenAPI 3.1 delta for the repo's single contract - one tag per bounded context, RFC 9457 problem types from the ao-prd
error catalogue, keyset cursor lists, a session-cookie security scheme, field constraints from goose CHECKs, River jobs
as the async contract - proven by a scratch oapi-codegen + orval run. Writes `contracts.ao-api-forge/` next to
contracts from another skill.
`/ao-break-tasks <slug>` in [.claude/skills/ao-break-tasks/](.claude/skills/ao-break-tasks/SKILL.md) closes the
design chain: the course `sdlc:break-tasks` flow (gate, slice, DAG, per-task DoD, tracker, `tasks.json`) cut along
the monolith's vertical layers - new-context wiring, goose migration via `promote-migration` and `/roundtrip`, sqlc,
stdlib-only domain with the §5.1 sentinels, use case, strict-server handler with problem+json, River job, route +
feature component + a story per state, Playwright e2e - with one task per §10 transition and DoD lines that name
the command, the AC and the error code. It reads CONTEXT.md invariants, sentinels and the org filter (and stops
without them), keeps `tasks.json` consumable by `/sdlc:implement-tasks`, and ships `scripts/check-tasks.mjs`
(deps, cycles, Stage-1 AC and error-code coverage, `association_id` on every query, layer order, generated
files), tested in `tests/ao-break-tasks.test.sh`. Writes `tasks.ao-break-tasks/` next to tasks from another skill.

## License

MIT, see [LICENSE](LICENSE).
