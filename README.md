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

## Development

`bash scripts/validate.sh` runs every check (JSON syntax, `claude plugin validate --strict`, manifest
version sync, shell lint, tests). CI runs the same script.

Project-local skill (not shipped with the plugin): `/ao-sdlc-audit <slug>` in
[.claude/skills/ao-sdlc-audit/](.claude/skills/ao-sdlc-audit/SKILL.md) audits a feature folder for the
nine SDLC artifacts (sdlc or sdd layout) and reports which are present, missing or stale.
`/ao-discovery <slug>` in [.claude/skills/ao-discovery/](.claude/skills/ao-discovery/SKILL.md) runs a
discovery interview tuned for housing-association (OSBB) features and writes `idea-brief.md`.

## License

MIT, see [LICENSE](LICENSE).
