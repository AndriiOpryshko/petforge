# Definition of Done catalogue - per layer

Every task's DoD = the **common lines** + its **layer lines**, filled with the real names: the AC
id(s) it proves, the exact `<context>.<error_name>` codes and statuses, the files. A DoD line
without a command or an observable result is not a DoD line. `tasks.json` `dod` is the one-sentence
summary of the same list and must name at least one command.

## Common lines (every task)

- [ ] Proves `<AC-id>`: <the Then of the AC in a few words> - asserted by `<test name>` in `<file>`.
- [ ] `mise run lint` clean (golangci-lint incl. depguard `<bc>-private` and `domain-pure`, eslint, tsc).
- [ ] No hand edit under `*.gen.go`, `sqlcgen/`, `apps/web/src/api/gen/`, `routeTree.gen.ts`.
- [ ] Commit `<type>(<slug>): <task title>` with `SDLC-Task: <id>` and one `SDLC-AC: <id>` per AC;
      on `feature-1/*` / `feature-2/*` a `LOG.md` `commit` line.

## wiring

- [ ] `<bc>` tag + first `/<bc>/...` operation in `services/core/api/openapi.yaml`.
- [ ] `services/core/internal/<bc>/adapters/http/gen/oapi-codegen.yaml` (package `gen`, include-tags `<bc>`).
- [ ] `services/core/sqlc.yaml` entry `<bc>`; empty `adapters/postgres/queries/` with a `.gitkeep` or first query.
- [ ] `.golangci.yml`: `<bc>-private` depguard rule + `<bc>` in the `_test.go` exclusion regex.
- [ ] `cmd/api/main.go` lists `<bc>.New(pool)`; `module.go` uses `r.Group` + `httpapi.RequestValidator` (no `r.Mount`).
- [ ] `mise run gen && git diff --exit-code` clean after committing the generated files.
- [ ] `cd services/core && go build ./cmd/api && go test ./internal/<bc>/...` green (module test: the route answers).

## migration

- [ ] `/promote-migration <slug> <staged name>` wrote `services/core/migrations/0000N_<name>.sql`;
      the migration-lint hook reports nothing.
- [ ] `/roundtrip <N>` (N = last version on `main`) -> down `OK`, up `OK`, no schema diff.
- [ ] Every `REFERENCES` has its `CREATE INDEX`; every governance table has `association_id` NOT NULL
      with no cross-context FK (org-filter ADR); `CONCURRENTLY` only alone with `NO TRANSACTION`.
- [ ] `mise run gen && git diff --exit-code` clean (sqlc reads the Up sections).
- [ ] `cd services/core && go test ./internal/<bc>/...` green (`testdb.New(t)` applies every migration).
- Expand / backfill / contract: the DoD names the step and the deploy it ships in.

## sqlc

- [ ] Queries `<Name>` in `services/core/internal/<bc>/adapters/postgres/queries/<aggregate>.sql`;
      `mise run gen && git diff --exit-code` clean.
- [ ] **Org filter:** every query has `WHERE ... association_id = @association_id` (ADR-<id>);
      integration test `Test<Repo>_OtherAssociationInvisible` inserts a row for association B and
      gets `<context>.<x>_not_found` from association A. (Or: `org-filter: n/a <reason>`.)
- [ ] Lists are keyset over `(created_at, id)` with `limit` + opaque cursor; the index from the data
      model's query -> index map exists.
- [ ] Adapter implements `ports.<Repo>`; `cd services/core && go test ./internal/<bc>/adapters/postgres/...`
      green on `testdb.New(t)`; pgx `ErrNoRows` mapped to the sentinel, never leaked.

## domain

- [ ] `services/core/internal/<bc>/domain/<aggregate>.go` imports stdlib (+ uuid) only (depguard `domain-pure`).
- [ ] Sentinels in `domain/errors.go`, one per code: `Err<Name>` whose code string is exactly
      `<context>.<error_name>` from PRD §5.1 / CONTEXT "Sentinel errors" (list them).
- [ ] Invariant `<CONTEXT invariant>` enforced by `<func>` and tested.
- [ ] State machine: table test `Test<Aggregate>Transitions` with one row per PRD §10 allowed
      transition and one per refused row, each refused row asserting its sentinel
      (`errors.Is(err, Err<Name>)`).
- [ ] `cd services/core && go test ./internal/<bc>/domain/...` green; no DB, no clock (time passed in).

## app

- [ ] Use case `<Verb><Noun>` in `services/core/internal/<bc>/app/<file>.go`; new port methods in `ports/ports.go`.
- [ ] Authorization first: actor must be a current член правління on the action date (§10) ->
      `403 <code>` before any resource is read; same body for an existing and a missing id.
- [ ] Revision guard: stale `revision` -> `<context>.draft_changed` (409).
- [ ] Every error branch of SAD §6 `<flow>` returns its sentinel (list the codes).
- [ ] Jobs enqueued in the same transaction as the state change (when the flow has one).
- [ ] `cd services/core && go test ./internal/<bc>/app/...` green (fakes for ports, or `testdb.New(t)`).

## http

- [ ] Operations `<operationId>` merged from the contract delta into `services/core/api/openapi.yaml`
      (tag `<bc>`, path `/<bc>/...`); `mise run gen && git diff --exit-code` clean.
- [ ] `services/core/internal/<bc>/adapters/http/handler.go` implements the strict methods;
      sentinel -> problem+json via `internal/platform/httpapi`: `<code>` -> `<status>` for every row
      of the operation's `x-problem-types`.
- [ ] Integration test through the module (httptest + `testdb.New(t)`): success status + body for
      `<AC>`; each error asserts status, `Content-Type: application/problem+json` and `code`; a 422
      from the shared validator has no `code`.
- [ ] `cd services/core && go test ./internal/<bc>/...` green.

## job

- [ ] Job `<kind>` args carry ids only (per `events.md`), unique key and retries as specified;
      worker registered from `<bc>/module.go`; enqueued inside the app transaction.
- [ ] Test: job runs against `testdb.New(t)` and leaves `<state>`; a provider failure leaves
      `<code>` / retry, nothing half-written.
- [ ] `cd services/core && go test ./internal/<bc>/jobs/...` green.

## web

- [ ] Hooks from `@/api/gen/endpoints/<bc>/<bc>` (no hand fetch); route
      `apps/web/src/routes/<route>.tsx`; component `apps/web/src/features/<bc>/<component>.tsx` built
      from `src/components/ui` primitives (no new primitive unless none fits - say which).
- [ ] One story per visual state in `<component>.stories.tsx` (`<State1>`, `<State2>`, error
      `<code>` shown with the §5.1 message), matching Figma node `<id>` when the design spec has one.
- [ ] `pnpm --filter @spilno/web test:stories` green with a11y checks; `pnpm --filter @spilno/web test`
      green for the logic (`<file>.test.ts`).
- [ ] `pnpm --filter @spilno/web typecheck` and `lint` clean; `mise run gen && git diff --exit-code` clean.

## e2e

- [ ] `apps/web/e2e/<story>.spec.ts` drives `<US-id>`: <steps>, asserts `<AC-ids>` on the page
      (text, state badge, disabled actions) and one refusal (`<code>` message).
- [ ] `mise run dev` up; `mise run e2e` green.
- [ ] Last e2e task of the epic: `/green` passes (lint -> test -> e2e).

## docs

- [ ] `<file>` updated with <what>; links resolve; the ADR's "Migration" block is done or tracked.
