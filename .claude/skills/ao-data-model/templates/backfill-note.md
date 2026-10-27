---
table: <table>
column: <column>
staged_file: NNNNN_backfill_<table>_<column>.sql
phase: 2 of 3
owner: "<name>"
updated_at: "<YYYY-MM-DD>"
---

# Backfill - `<table>.<column>`

## Why

<PRD §9 bullet / AC that needs the column filled for existing rows.>

## Source of the value

<Where each row's value comes from: a constant id (the one association), another column, another
table in the same context. Never another context's table - get it through its module.go in Go and
write a Go backfill command instead.>

## Size and ETA

| Rows to fill (estimate) | Batch size | Batches | ETA | Measured on |
|---|---|---|---|---|
| `SELECT count(*) FROM <table> WHERE <column> IS NULL` -> <n> | 5000 | <n/5000> | <seconds> | local copy, <date> |

## Preconditions

- Phase 1 (`NNNNN_add_<table>_<column>.sql`) is deployed and the dual write is live (new rows
  arrive with `<column>` set).

## Resumability

The loop touches only rows where `<column> IS NULL` and commits per batch; re-running after a
failure continues where it stopped. Locks: row locks per batch, `SKIP LOCKED` against the app.

## Verification (gate for phase 3)

```sql
SELECT count(*) FROM <table> WHERE <column> IS NULL;   -- must be 0
```

## Rollback

Down is a no-op (see the file). To undo the feature, roll back phase 1, which drops the column.
