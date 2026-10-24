# Repo practice — what ao-architecture proposes before asking

Defaults for a Go modular monolith + React web client laid out like
[spilno](https://github.com/AndriiOpryshko/spilno). Read the target repo first (`CLAUDE.md`,
`docs/adr/`, `mise.toml`, `infra/compose.yaml`, `services/*/internal/`); where it differs, the repo
wins and the difference goes to §2 Constraints. Values below are starting points for the Socratic
walk, not facts.

## Reference SAD material

- Repo ADRs: `docs/adr/0001-*.md` … — stack, bounded contexts, spec-first codegen, migrations.
  Feature ADRs never re-decide them silently; they cite them in `Links` and in §2.
- Existing contexts as reference building blocks: every `services/core/internal/<bc>/` with
  `domain/` (stdlib only), `app/` (use cases), `ports/` (interfaces), `adapters/http/` (generated
  `StrictServerInterface`), `adapters/postgres/` (sqlc), `module.go` (the only importable package).
- Course example for shape only: `sdlc/examples/course-lesson-mvp/sad.md` of the course repo.
- A previous feature's `sad.md` in `docs/features/*/` when it exists — reuse its §2, §7, §8 rows.

## Recommended containers (§5)

Draw one `Container` per declared target surface and keep the rest of the system as below. Drop a
row only with a reason.

| Alias | Name | Technology | Purpose |
|---|---|---|---|
| `web` | Web client | React + TanStack Router, generated hooks (`@/api/gen`) | UI for board members; talks only to `core` |
| `core` | Core API | Go modular monolith (chi, oapi-codegen strict server) | all bounded contexts in one process; one OpenAPI contract |
| `db` | Database | Postgres (version from `infra/compose.yaml`), goose + sqlc | one schema per process; each context owns its tables |
| `files` | File storage | object storage or a Postgres large-object table — decided by ADR | signed scans, case documents |
| `otel` | Observability | OpenTelemetry → Grafana LGTM | traces, metrics, logs |
| `ai` | Text generation service (external) | `System_Ext` | wording and warnings only; never numbers |
| `qes` | Qualified e-signature provider (external, if used) | `System_Ext` | signing or signature check |

Inside `core`, list the feature's bounded contexts as a nested `Container_Boundary` (for example
`governance`, `finance`, a new `protocols`), with cross-context arrows labelled «через module.go».

## Building-block layout (§5 tree)

```
services/core/internal/<bc>/
├── domain/              entities, value objects, sentinel errors (stdlib only)
├── app/                 use cases; authorization checks
├── ports/               interfaces app needs (repositories, other contexts)
├── adapters/http/       StrictServerInterface; problem+json
├── adapters/http/gen/   oapi-codegen config + output (generated)
├── adapters/postgres/   ports on Postgres; queries/ (sqlc in), sqlcgen/ (sqlc out)
└── module.go            wiring; the only package other contexts import
```

New context checklist for §5/§9 (from `CLAUDE.md`): tag in the spec, `oapi-codegen.yaml`,
`sqlc.yaml` entry, `<bc>-private` depguard rule, line in `cmd/api/main.go`.

## Crosscutting defaults (§8)

| Concept | Default |
|---|---|
| Errors on the wire | RFC 9457 `application/problem+json` (`internal/platform/httpapi`); codes from PRD §5.1 `<context>.<error_name>` in the problem `type` |
| Validation | OpenAPI request validator → 422 with field pointers; domain `Validate()` for rules |
| IDs | UUID (`github.com/google/uuid`) |
| Migrations | goose, one file per change, `StatementBegin/End` around functions and `DO` blocks |
| Queries | sqlc per context; no cross-context table access |
| Routing | `r.Group` per context, never `r.Mount` (generated handlers register absolute paths) |
| Authorization | in `app/` use cases against the board term in force on the action date |
| Observability | OpenTelemetry HTTP spans + request-duration histogram per route |
| Tests | integration with `testdb.New(t)` (fresh migrated DB), Vitest + Storybook for web, Playwright e2e |
| Generated code | never edited by hand (`*.gen.go`, `sqlcgen/`, `src/api/gen/`, `routeTree.gen.ts`) |

## Deployment defaults (§7)

One `core` process + Postgres + web static bundle; local stack via `infra/compose.yaml` and
`mise run dev`. A feature that adds no process may mark §7 `<!-- N/A: reuses the core deployment
unit -->` with the scaling numbers it still needs in one line.

## ADR naming convention

- File: `NNNN-<decision-in-kebab-case>.md`, numbered per feature folder from `0001`, decision form:
  `0002-store-protocols-in-a-new-protocols-context.md` ✓, `0002-protocol-storage.md` ✗.
- Title line: `# NNNN <decision as a sentence>` (same form as `docs/adr/`).
- Frontmatter like the repo ADRs: `status: accepted`, `date: YYYY-MM-DD`, plus `feature`, `sad_section`.
- Mandatory `## Blast radius` (four criteria) and `## Links` with three links: PRD (US/AC id),
  `sad.md §N`, related ADR (feature or repo `docs/adr/`).

## Inputs from an ao-prd PRD

When the PRD has them (`skill: ao-prd`), use them instead of re-deriving:

- §5.1 Error catalogue → §8 Error handling row and the context list in §5.
- §9 Migration plan → §5 data ownership, §7, the «touches the database» criterion and §11 risks.
- §10 RBAC → §8 Authorization row; §10 state machine → owner context in §5 and one §6 flow per
  critical transition (sign, lock, refuse edit after lock).
