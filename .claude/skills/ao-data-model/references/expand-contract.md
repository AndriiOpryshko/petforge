# Expand / backfill / contract on Postgres 18 with goose

Used at Protocol step 13 whenever a change touches a table that already has rows in production:
a new NOT NULL column, a rename, a re-type, a drop, a new FK or CHECK on a large table. PRD §9
(ao-prd) names these tables; the brownfield diff finds the rest.

## The three phases

| Phase | Staged file | Template | Ships | App code at this phase |
|---|---|---|---|---|
| 1 Expand | `NNNNN_add_<table>_<column>.sql` (+ `NNNNN_index_<table>_<column>.sql` if indexed) | [expand.sql](../templates/expand.sql) | PR 1, deploy | writes the new column on every insert/update (dual write in Go), reads the old one |
| 2 Backfill | `NNNNN_backfill_<table>_<column>.sql` + `backfill-<table>-<column>.md` | [backfill.sql](../templates/backfill.sql), [backfill-note.md](../templates/backfill-note.md) | PR 2, deploy | unchanged; after deploy, reads switch to the new column |
| 3 Contract | `NNNNN_contract_<table>_<column>.sql` | [contract.sql](../templates/contract.sql) | PR 3, deploy | old column no longer read or written |

Rules:

- Each phase is its own PR and deploy; never promote phase N+1 before phase N is live.
- Dual write is Go code in the owning context's `app/` or `adapters/postgres/`, never a trigger.
- A table under ~10k rows (most OSBB tables) may fold phases 1-3 into one migration if the user
  accepts a brief lock; record that choice and its row count in `data-model.md` «Migration plan».
- `CREATE INDEX CONCURRENTLY` always for an existing table, from
  [index-concurrently.sql](../templates/index-concurrently.sql): `-- +goose NO TRANSACTION`, one
  statement per file. If it fails it leaves an `INVALID` index: Down drops it with
  `DROP INDEX CONCURRENTLY IF EXISTS`, and the fix is a re-run.
- NOT NULL on an existing column: `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID`
  (instant), `VALIDATE CONSTRAINT` (SHARE UPDATE EXCLUSIVE, writes keep going), then
  `SET NOT NULL` (Postgres uses the validated CHECK and skips the full scan), then drop the helper
  CHECK. Same NOT VALID + VALIDATE pattern for a new FK on a big table.
- Backfill in batches (1k-10k rows). A `DO` block may `COMMIT` between batches (Postgres 11+) only
  when it is not inside a transaction block, so the backfill file is `-- +goose NO TRANSACTION`
  and the loop is resumable (it only touches rows still `NULL`). Checked with goose v3 + pgx on
  Postgres 18.6: the `COMMIT` inside the `DO` runs. A small table may run the loop
  without `COMMIT` inside goose's normal transaction; say which in the backfill note.
- Renames: add new column -> dual write -> backfill -> switch reads -> drop old. Never
  `ALTER TABLE ... RENAME COLUMN` on a table the running app reads.

## Schema roundtrip

Proves every Down restores the exact previous schema. Run it on the local compose database after
promoting (or on a scratch database with the staged files renumbered into a temporary copy of
`migrations/`). Ask the user before running; never against a shared database.

1. **Stop the core API** (`mise run dev` pane `core`, or `air`): it runs `postgres.Migrate` on
   start and would re-apply migrations in the middle of the roundtrip.
2. Shortcut used below:

   ```sh
   G='go tool -modfile=tools/go.mod goose -dir migrations postgres postgres://spilno:spilno@localhost:5432/spilno?sslmode=disable'
   dump() { docker compose -f infra/compose.yaml exec -T postgres pg_dump -U spilno -d spilno --schema-only --no-owner --no-privileges | grep -v -e '^--' -e '^\\restrict' -e '^\\unrestrict' | sed '/^$/d'; }
   ```

3. Let `N` be the last version before the feature's first migration.

   ```sh
   (cd services/core && $G up-to N)    && dump > /tmp/schema-N.sql
   (cd services/core && $G up)         && dump > /tmp/schema-up.sql
   (cd services/core && $G down-to N)  && dump > /tmp/schema-down.sql
   diff /tmp/schema-N.sql /tmp/schema-down.sql       # must be empty: Down restores exactly
   (cd services/core && $G up)         && dump > /tmp/schema-up2.sql
   diff /tmp/schema-up.sql /tmp/schema-up2.sql       # must be empty: Up is repeatable after Down
   ```

4. `goose_db_version` rows differ by design; the dump above has schema only, so it is not compared.
   pg_dump 18 prints `\restrict <random key>` / `\unrestrict` lines that change on every run; the
   `dump` function filters them, otherwise every diff is non-empty.
5. A non-empty diff names the missing piece (a CHECK, a default, an index, a trigger). Fix the
   Down, re-run. Record the result in the audit: `roundtrip: N -> up -> N -> up, diff empty`.
6. Restart the API when done.

`mise run test` also catches a broken Up (the template database migrates on first `testdb.New`),
but never a broken Down - only the roundtrip does.
