# Explorer prompt - Protocol step 3

Dispatch one `Agent` with `subagent_type: "Explore"` (or `general-purpose` if Explore is not
available; `sdlc:explorer` takes the same prompt when the sdlc plugin is installed). Clean context:
everything it needs is in the prompt. Substitute `{{SLUG}}`, `{{REPO}}` and `{{TABLES}}` (the
candidate tables from the PRD and SAD, comma-separated).

```text
You are a read-only scout for the data model of feature {{SLUG}} in the repo at {{REPO}}.
Do not edit anything and do not propose a design. Cite file:line for every claim; write
UNKNOWN: <what> instead of guessing. Read at most ~12 files; prefer grep.

Report, in this order:

1. Migrations: path of the live folder, the last file name and its number, the goose markers in
   use (Up/Down, StatementBegin/End, NO TRANSACTION), how they are applied (embed, on start, in
   tests), the command that creates a new one (mise.toml).
2. Live schema per table: columns with types, NOT NULL, defaults, CHECKs, FKs, indexes, triggers,
   functions. Parse the "-- +goose Up" sections of the migration files offline; do not connect to a
   database.
3. Context ownership: for each table, the bounded context whose sqlc queries
   (services/*/internal/<bc>/adapters/postgres/queries/*.sql) use it, and the sqlc.yaml entry.
   Flag any table used by two contexts.
4. Queries vs indexes: every "-- name: X" query with its WHERE / ORDER BY columns and the index
   that serves it, or "NO INDEX".
5. Domain structs for {{TABLES}} if they exist (internal/<bc>/domain/*.go): field name, Go type,
   pointer or not - for drift detection.
6. Conventions: PK type and default, timestamp columns, updated_at trigger, string type and length
   rule, money representation, enum representation, constraint and index naming.
7. Postgres version (infra/compose.yaml, testdb image) and the DATABASE_URL default.
8. Repo rules: .claude/rules/migrations.md if present, docs/adr/* about migrations, contexts or
   queries, and the depguard <bc>-private rules in .golangci.yml.
9. Debt you noticed: business-value defaults, queries without an index, FKs without an index,
   cross-context references.
```

Reconcile the report with [goose-practice.md](./goose-practice.md); where they differ, the repo wins
and the difference goes to the audit.
