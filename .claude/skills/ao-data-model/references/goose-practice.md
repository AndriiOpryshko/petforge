# Goose practice - how migrations work in the target repo

Defaults for a repo laid out like [spilno](https://github.com/AndriiOpryshko/spilno). Read the
target repo first (`CLAUDE.md`, `docs/adr/0004-*`, `mise.toml`, `services/core/sqlc.yaml`,
`services/core/migrations/`); where it differs, the repo wins and the difference goes to the audit.

## Runner

- goose v3, pinned in `services/core/tools/go.mod`, run as a Go tool:
  `cd services/core && go tool -modfile=tools/go.mod goose -dir migrations postgres "$DATABASE_URL" <cmd>`.
  `DATABASE_URL` defaults to `postgres://spilno:spilno@localhost:5432/spilno?sslmode=disable`
  (`internal/platform/config`).
- New file: `mise run migrate:new <verb>_<entity>` -> `goose -dir migrations create -s <name> sql`
  -> `services/core/migrations/0000N_<verb>_<entity>.sql` (the `-s` flag means sequential numbers).
- Files are embedded (`migrations/embed.go`, `//go:embed *.sql`). `postgres.Migrate` runs
  `goose.NewProvider(...).Up` **on API start**, and `testdb.New(t)` migrates a template database
  once per test binary. Consequence: any `.sql` file in that folder is live for every developer
  and every test the moment it exists.
- sqlc (`services/core/sqlc.yaml`, one entry per context) uses `schema: migrations` and reads only
  the `-- +goose Up` sections. A migration that sqlc cannot parse breaks `mise run gen` for every
  context.
- Postgres version: `infra/compose.yaml` and `testdb` (`postgres:18.6-alpine`).

## File shape

```sql
-- +goose Up
CREATE TABLE ... ;

-- +goose Down
DROP TABLE ... ;
```

- One file per migration, Up then Down. Down undoes exactly the Up, in reverse order.
- goose splits statements on `;`. Wrap every function, `DO` block and anything with `;` inside a
  body in `-- +goose StatementBegin` / `-- +goose StatementEnd`.
- Each file runs in one transaction by default. `CREATE INDEX CONCURRENTLY`,
  `DROP INDEX CONCURRENTLY` and `ALTER TYPE ... ADD VALUE` need `-- +goose NO TRANSACTION` as the
  first line, and then the file holds that one statement (plus its Down) so a failure leaves nothing
  half-applied.
- The shared `set_updated_at()` function exists from `00001_init.sql`; a mutable table attaches
  `CREATE TRIGGER <table>_set_updated_at BEFORE UPDATE ON <table> FOR EACH ROW EXECUTE FUNCTION set_updated_at();`
  and its Down drops the table (the trigger goes with it) or `DROP TRIGGER` when only the trigger is
  added.
- Constraint names: let Postgres name inline CHECKs (`<table>_<col>_check`); name table-level and
  added-later constraints explicitly (`<table>_<rule>_check`, `<table>_<cols>_key`,
  `<table>_<col>_fkey`) so Down and later ALTERs can refer to them.
- Index names: `<table>_<cols>_idx`; unique: `<table>_<cols>_key`.

## Naming

- `0000N_<verb>_<entity>.sql`, verbs: `create`, `add`, `alter`, `backfill`, `contract`, `drop`, `seed`,
  `index`. Examples: `00004_create_protocols.sql`, `00007_add_meetings_association_id.sql`,
  `00008_backfill_meetings_association_id.sql`, `00009_index_meetings_association_id.sql`.
- Tables plural snake_case; columns snake_case; FK columns `<entity>_id`.

## Staging

- Staged files live in `docs/features/<slug>/migrations/` (or `migrations.ao-data-model/`) with the
  literal prefix `NNNNN_` (`NNNNN_create_protocols.sql`): they cannot be applied, sorted into the
  live sequence or collide with another branch.
- `MANIFEST.md` in the same folder fixes the order and the PR each file ships in:

  | Order | Staged file | Ships in | Depends on | Expand/contract phase |
  |---|---|---|---|---|
  | 1 | `NNNNN_create_associations.sql` | PR 1 | - | - |
  | 2 | `NNNNN_add_meetings_association_id.sql` | PR 1 | 1 | expand |

- Backfill notes (`backfill-<table>-<column>.md`) and `_drift/` proposals sit in the same folder.

## Promote

Done when the feature is built (by `/sdlc:implement-tasks`, or by hand), never by this skill:

1. Make sure the working branch is rebased on `main` (the last live number must be current).
2. For each file in `MANIFEST.md` order: `mise run migrate:new <verb>_<entity>`, then replace the
   generated body with the staged file's content. Do not hand-type the number.
3. Files of later expand/contract phases are promoted only in their own PR, after the previous
   phase is deployed.
4. `mise run gen` (sqlc re-reads the Up sections) -> `mise run lint` -> `mise run test`.
5. Run the schema roundtrip from [expand-contract.md](./expand-contract.md#schema-roundtrip) on the
   local database.
6. Leave the staged copies in the feature folder; mark `promoted: 0000N` in `MANIFEST.md`.

## Known debt in the reference repo (flag, do not copy)

- `meetings.kind DEFAULT 'REGULAR'` - a business-value default; new tables must not repeat it.
  `meetings.quorum_required DEFAULT true` is a business flag, not a technical one - same note.
- `ListMeetings` pages by `(created_at, id)` with no matching index - acceptable at today's row
  count, but a new keyset query on a growing table needs `(<scope>, created_at DESC, id DESC)`.
- `contracts.currency CHECK (currency IN ('UAH','EUR','USD'))` is a closed-set CHECK - allowed;
  adding a currency is a migration, which is the intended cost.
