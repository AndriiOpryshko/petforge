# Self-check - Protocol step 14

Runs over every staged file and `data-model.md` before the commit. Each check prints `PASS` or
`FAIL <file>:<line> <reason>`. Any FAIL is fixed or surfaced with `AskUserQuestion`; no silent
commit. Results go to the audit.

## Course checks, adapted

1. **Naming.** Tables plural snake_case; staged files `NNNNN_<verb>_<entity>.sql` with a verb from
   [goose-practice.md](./goose-practice.md#naming); index and constraint names per the same file.
2. **Up/Down symmetry.** Every `CREATE TABLE` has a `DROP TABLE`; `ADD COLUMN` -> `DROP COLUMN`;
   `CREATE INDEX` -> `DROP INDEX`; `ADD CONSTRAINT` -> `DROP CONSTRAINT`; `CREATE TRIGGER` ->
   `DROP TRIGGER` (or dropped with its table); `CREATE FUNCTION` -> `DROP FUNCTION`; Down runs in
   reverse order of Up.
3. **FK indexes.** Every `REFERENCES t(id)` column has an index whose leading column is that FK
   (a composite UNIQUE starting with it counts).
4. **Banned features** (per `.claude/rules/migrations.md`):
   - `CREATE TRIGGER` other than `<table>_set_updated_at` without an ADR link in a comment on the
     line above -> FAIL;
   - `CREATE FUNCTION` other than a trigger function an ADR approves -> FAIL;
   - `DEFAULT` other than `now()`, `gen_random_uuid()`, `false`, `0`, `'{}'`-style empty
     technical values -> FAIL (business-value default);
   - `CHECK` whose literal is a changeable number (a limit, a share, a quorum) -> FAIL; length,
     closed-set enum, positive amount, date order -> allowed;
   - `serial`, `bigserial`, `GENERATED ... AS IDENTITY` as PK, `CREATE SEQUENCE` for a PK -> FAIL;
   - `deleted_at` / `is_deleted` without an ADR -> FAIL;
   - `VARCHAR(`, `CHAR(`, `money`, `float`/`real`/`double precision` for amounts -> FAIL.

## Practice checks

5. **Goose markers.** Each file has exactly one `-- +goose Up` and one `-- +goose Down`, Up first;
   every `$$` body and `DO` block sits between `StatementBegin` / `StatementEnd`; a file with
   `CONCURRENTLY` starts with `-- +goose NO TRANSACTION` and has one statement per direction.
   No `+goose` text inside an ordinary comment: goose parses `-- -- +goose Up` as a second
   annotation and fails with «duplicate '-- +goose Up' annotations».
6. **Down restores exactly.** Read the Down against the schema before the Up: a dropped column comes
   back with its type, NOT NULL, default, CHECK, FK and index; a narrowed CHECK is widened back.
   Static reading here; the [schema roundtrip](./expand-contract.md#schema-roundtrip) proves it.
7. **Query coverage.** Every row of the data model's Query -> index map names an index, «PK», or
   «seq scan accepted» with a row estimate; every index in the migrations appears in the map.
8. **No cross-context FK.** For each `REFERENCES t`, the owner of `t` (ownership table) equals the
   owner of the referencing table. A cross-context reference is a plain `uuid` column with a
   comment `-- id of <context>.<table>, no FK (ADR 0002)`.
9. **Association scope** (when the feature has an ADR like «scope rows to one association»):
   every owned table has `association_id uuid NOT NULL`, every UNIQUE includes it, every query in
   the map filters on it.
10. **sqlc parse.** The Up sections must parse for sqlc. Static: no psql meta-commands, no
    `\copy`, no unsupported syntax. Dynamic, only if the user agrees: copy `services/core` to a
    scratch folder, place the staged files with temporary numbers after the last live one, run
    `go tool -modfile=tools/go.mod sqlc compile` (or `mise run gen` in the copy), discard the copy.
    Never place staged files into the live tree to run it.

## Output

```
self-check: 10/10 PASS
  roundtrip: not run (user declined) | N -> up -> N -> up, diff empty
  sqlc: compile OK in scratch copy | static only
```
