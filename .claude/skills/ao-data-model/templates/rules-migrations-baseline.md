# Migration rules - baseline

<!-- Bootstrapped by petforge ao-data-model from CLAUDE.md and docs/adr/0002, 0004. Edit freely;
     this file wins over the skill's template on the next run. -->

Sources: `CLAUDE.md` (Commands, Layout rules, Gotchas), repo ADR 0002 (bounded contexts), repo
ADR 0004 (goose migrations and sqlc queries). A rule here that contradicts an ADR is a bug in this
file.

## Runner and files

- goose v3 via `go tool -modfile=tools/go.mod goose`; new file with `mise run migrate:new <name>`
  -> `services/core/migrations/0000N_<verb>_<entity>.sql` (sequential).
- One file per migration: `-- +goose Up`, then `-- +goose Down`. Down restores the exact previous
  schema.
- goose splits on `;`: functions, `DO` blocks and any body with `;` go between
  `-- +goose StatementBegin` and `-- +goose StatementEnd`.
- `CREATE INDEX CONCURRENTLY` (and other statements that cannot run in a transaction):
  `-- +goose NO TRANSACTION`, one statement per file.
- The API applies pending migrations on start and tests migrate a template database: a file in
  `services/core/migrations/` is live immediately. Feature designs stage files in
  `docs/features/<slug>/migrations/` with an `NNNNN_` placeholder until the feature is built.
- sqlc reads only the Up sections (`schema: migrations`); run `mise run gen` after any migration.
- Never edit a migration that has reached `main`; write a new one.

## Types and columns

- PK: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. No `serial` / identity / sequence PKs.
- Timestamps: `created_at timestamptz NOT NULL DEFAULT now()` on every table. Mutable rows also get
  `updated_at timestamptz NOT NULL DEFAULT now()` and the shared trigger
  `CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION set_updated_at();`.
  Append-only rows have `created_at` only.
- Strings: `text` with `CHECK (char_length(col) BETWEEN 1 AND N)` (or `<= N` when empty is allowed);
  N comes from the PRD AC. No `VARCHAR(N)` / `CHAR(N)`.
- Money: `bigint` in minor units (`<name>_minor` or `amount_cents`) + `currency text` with a
  closed-set CHECK. No `money`, `numeric` for stored amounts only if an ADR says so, never `float`.
- Calendar facts (a signing date, a meeting date in the protocol) are `date`; instants (when a row
  was written, when a meeting started) are `timestamptz`. Display time zone is `Europe/Kyiv`; it is
  never stored in the column.
- Enums of a closed set: `text` + `CHECK (col IN (...))`, not a Postgres `ENUM` type (adding a value
  is a plain ALTER of the CHECK, inside a transaction).
- JSONB only for opaque payloads (snapshots, external metadata); structured fields are columns.

## Allowed constraints

- `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, FK inside one context.
- `CHECK` for stable invariants: length, closed-set enum, positive amount, date order
  (`ends_at >= signed_at`), "exactly one of" nullability. Name table-level CHECKs.
- `DEFAULT` only for `now()`, `gen_random_uuid()`, and technical `false` / `0` flags.

## Banned (unless an ADR says otherwise, cited in a comment above the statement)

- `CHECK` that encodes a changeable business rule: a limit, a quorum number or share, a charter
  threshold. Those live in Go and in effective-dated data.
- Triggers other than `set_updated_at` and ADR-approved immutability guards (reject UPDATE/DELETE
  on a locked-record table). Each guard cites its ADR.
- Business-value defaults (`DEFAULT 'REGULAR'`, `DEFAULT true` on a business flag). Existing:
  `meetings.kind DEFAULT 'REGULAR'`, `meetings.quorum_required DEFAULT true` - debt, do not copy.
- Stored procedures and functions with business logic.
- Foreign keys across bounded contexts (repo ADR 0002): another context's row is referenced by its
  `uuid` only, with a comment `-- id of <context>.<table>, no FK (ADR 0002)`.
- Soft delete (`deleted_at`, `is_deleted`) unless an ADR asks; retention rules use states and
  immutability, not hidden rows.
- Sequences as PK; `IF NOT EXISTS` to paper over a migration that may have half-run.

## Indexes

- Every FK column has an index whose leading column is that FK.
- Every sqlc query (`-- name:` in `internal/<bc>/adapters/postgres/queries/*.sql`) is served by an
  index or the PK, recorded in the feature's Query -> index map. No index without a query.
- Keyset pages `(created_at, id)` need `(<scope>, created_at DESC, id DESC)`.
- On an existing table: `CREATE INDEX CONCURRENTLY` in a `NO TRANSACTION` file.

## Ownership

- Each table belongs to exactly one bounded context (`internal/<bc>/`); only that context's sqlc
  queries touch it. Another context reads it through the owner's `module.go`.
- A new context needs its `sqlc.yaml` entry (see `CLAUDE.md` Layout rules).

## Zero-downtime changes on existing tables

- New NOT NULL column: add nullable -> backfill in batches -> `ADD CONSTRAINT ... CHECK (col IS NOT
  NULL) NOT VALID` -> `VALIDATE CONSTRAINT` -> `SET NOT NULL` -> drop the helper CHECK.
- Rename / re-type / drop: add new + dual write in Go -> backfill -> switch reads -> drop old. Each
  phase is its own PR and deploy. Dual write is never a trigger.
- A small table (< ~10k rows) may do it in one migration if the feature's data model says so.

## Seeds and fixtures

- Bootstrap rows the app needs to start: own migration, fixed uuid, `ON CONFLICT DO NOTHING`.
- Test data: Go helpers with `testdb.New(t)`, never migrations.
- PII guard: `example.test` e-mails, made-up names, no real phone numbers.

## Verification

- Schema roundtrip (up -> down-to N -> up, `pg_dump --schema-only` diff empty) for every feature's
  migrations, with the core API stopped.
- `mise run gen`, `mise run lint`, `mise run test` green after promoting.
