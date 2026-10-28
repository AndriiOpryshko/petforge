# Repo practice the tasks are written against

The defaults below describe spilno-shaped repos (Go modular monolith in `services/core`, React in
`apps/web`, tasks through `mise`). Read the repo first; where it disagrees, the repo wins and the
difference goes to `_epic.md` Notes.

## Layout (CLAUDE.md "Layout rules")

| Piece | Path |
|---|---|
| Contract (one per repo) | `services/core/api/openapi.yaml` (3.1, one tag per operation = its context, paths `/<context>/...`) |
| Context | `services/core/internal/<bc>/` |
| Domain (stdlib + `github.com/google/uuid` only, depguard `domain-pure`) | `internal/<bc>/domain/` |
| Use cases | `internal/<bc>/app/` |
| Ports (interfaces the app needs) | `internal/<bc>/ports/` |
| HTTP adapter (implements generated `StrictServerInterface`) | `internal/<bc>/adapters/http/` |
| oapi-codegen config + output | `internal/<bc>/adapters/http/gen/` (`oapi-codegen.yaml`, `<bc>.gen.go` - generated) |
| Postgres adapter | `internal/<bc>/adapters/postgres/` |
| sqlc input / output | `adapters/postgres/queries/*.sql` / `adapters/postgres/sqlcgen/` (generated) |
| Module (only importable package) | `internal/<bc>/module.go` with `Routes(r chi.Router) error` using the `r.Group` pattern of `internal/system/module.go` (never `r.Mount`) |
| Composition root | `services/core/cmd/api/main.go` (`modules := []module{...}`) |
| Worker process (when the SAD adds one) | `services/core/cmd/worker/main.go`, jobs in `internal/<bc>/jobs/` |
| Migrations (goose, one file Up/Down) | `services/core/migrations/0000N_<name>.sql` |
| Errors on the wire | `internal/platform/httpapi` (RFC 9457 `application/problem+json`, `code` extension) |
| Test DB | `internal/platform/testdb.New(t)` - a fresh migrated database per test (testcontainers, needs Docker) |
| Web pages | `apps/web/src/routes/` (TanStack file routes; `routeTree.gen.ts` is generated) |
| Web feature components | `apps/web/src/features/<bc>/` |
| UI primitives | `apps/web/src/components/ui/` (shadcn) |
| Generated client | `apps/web/src/api/gen/` (orval; hooks from `@/api/gen/endpoints/<bc>/<bc>`) |
| Stories | `*.stories.tsx` next to the component, mirror Figma variants, run in Chromium with a11y |
| e2e | `apps/web/e2e/*.spec.ts` (Playwright, `testDir: ./e2e`) |

Generated, never edited by a task: `*.gen.go`, `sqlcgen/`, `apps/web/src/api/gen/`,
`routeTree.gen.ts`. petforge's guard hook blocks such edits; a DoD regenerates them instead.

## New bounded context (CLAUDE.md)

A context the SAD marks **new** gets one `wiring` task before anything else in it:

1. its tag (and a placeholder operation if none yet) in `services/core/api/openapi.yaml`;
2. `internal/<bc>/adapters/http/gen/oapi-codegen.yaml` (copy a sibling, change package and tag filter);
3. a `sqlc.yaml` entry (`name: <bc>`, `queries: internal/<bc>/adapters/postgres/queries`,
   `out: internal/<bc>/adapters/postgres/sqlcgen`);
4. a `<bc>-private` depguard rule in `services/core/.golangci.yml` **and** `<bc>` in the
   `_test.go` exclusion regex `(system|finance|governance|<bc>)-private`;
5. `<bc>.New(pool)` in `cmd/api/main.go` and `module.go` with the `r.Group` pattern.

`/petforge:slice` can scaffold this when the context starts with one entity; the task still owns
the DoD.

## Commands (mise, from the repo root)

| Command | What it proves |
|---|---|
| `mise run gen && git diff --exit-code` | generated Go server, sqlc code and TS client are up to date and committed (same as `mise run gen:check`) |
| `mise run lint` | golangci-lint incl. depguard context boundaries and `domain-pure`, eslint, `tsc` |
| `cd services/core && go test ./internal/<bc>/...` | unit + integration of one context (testcontainers via `testdb.New(t)`) |
| `pnpm --filter @spilno/web test` | Vitest unit project |
| `pnpm --filter @spilno/web test:stories` | stories as tests in Chromium with a11y checks |
| `pnpm --filter @spilno/web typecheck` / `lint` | TS and eslint only |
| `mise run e2e` | Playwright; needs the core API up (`mise run dev`) |
| `mise run test` | all Go tests + Vitest + stories |
| `/green` | `mise run lint` -> `mise run test` -> `mise run e2e`, stops on the first failure (the repo's "green") |
| `/roundtrip <N>` | up -> down-to N -> up with `pg_dump --schema-only` diffs; N = last migration version on `main` (`git ls-tree --name-only origin/main services/core/migrations/ \| sort \| tail -1`) |
| `/promote-migration <slug> [name]` | staged migration -> goose file, migration-lint hook, then gen, lint, roundtrip, test |

## Migrations (`.claude/rules/migrations.md`, repo ADR 0004)

- Staged in the feature folder, promoted at implementation time by `/promote-migration`; the live
  number is assigned then, never in the plan.
- A file with `CREATE INDEX CONCURRENTLY` holds that one statement with `-- +goose NO TRANSACTION`.
- Functions and `DO` blocks inside `-- +goose StatementBegin` / `StatementEnd`.
- Existing tables: new NOT NULL column = expand -> backfill -> contract, each its own PR and deploy;
  new index = `CONCURRENTLY`.
- Triggers only where an ADR allows them (e.g. the protocol immutability triggers).

## Contract and errors (`.claude/rules/openapi.md`)

- The feature contract is a **delta**; the first `http` task of a context merges its operations and
  schemas into `services/core/api/openapi.yaml`, then `mise run gen`.
- Errors are problem+json; `code` = `<context>.<error_name>` from PRD §5.1; validation is `422`
  (shared validator: no `code`; context-produced: with `code`), `404` existence-hiding, `409`
  state / revision conflict, `403` not a current член правління, `401` no session, `503` storage
  or provider unavailable.
- Auth is a session cookie; `401 identity.session_required` and `403 identity.not_current_member`
  (or the feature's equivalent from §5.1) come from the middleware before any resource is read.
- Lists: `?cursor=&limit=` -> `{items, next_cursor}`, keyset over `(created_at, id)`.
- Mutations of a revisioned aggregate carry the revision; a stale write answers `409`.

## Org filter

Every new governance (and finance) query filters by `association_id` (the feature's org-filter ADR,
e.g. board-protocol `adr/0015` / `adr.ao-architecture/0016`), even with one association: a row of
another association is invisible and answers the context's `*_not_found`. Tables that *are* the
association (`associations`) or are keyed by the session itself state `org-filter: n/a <reason>`.

## Metrics log (CLAUDE.md)

On `feature-1/*` and `feature-2/*` branches every check and commit gets a `LOG.md` line with a
timestamp from `date +%Y-%m-%dT%H:%M:%S%z`; `/green` and `/roundtrip` write their own `check`
lines. A task's Verification section reminds the implementer of the `commit` line.
