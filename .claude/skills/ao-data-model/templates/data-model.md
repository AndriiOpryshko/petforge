---
status: Draft
skill: ao-data-model
owner: "<Backend lead name>"
reviewers: []
updated_at: "<YYYY-MM-DD>"
feature_size: "<from .size, or M (default)>"
prd: "<PRD.ao-prd.md | PRD.md>"
sad: "<sad.ao-architecture.md | sad.md>"
mode: "<greenfield | brownfield>"
stage: "07"
ticket: ""
contexts: [<context>, <context (new)>]
---

# Data model - <slug>

<!-- ao-data-model. Migrations are STAGED in ./migrations/ (or ./migrations.ao-data-model/) with the
     placeholder prefix NNNNN_ and an ordered MANIFEST.md; they are renumbered into
     services/core/migrations/ only at promote time (references/goose-practice.md#promote).
     Rules: .claude/rules/migrations.md (repo ADR 0002, 0004). -->

> **Inputs:** [PRD](./<prd>) · [SAD](./<sad>) · [CONTEXT](./CONTEXT.md) · rules
> [`.claude/rules/migrations.md`](../../../.claude/rules/migrations.md) · repo ADRs [`docs/adr/`](../../adr/)

## ER diagram

<!-- instruction: one manually ordered erDiagram. Group entities by context (a comment line per
     context). Cross-context references are drawn with a dotted relation labelled "id only".
     Key classes PK / FK / UK only. Validate per references/shared/mermaid-check.md. -->

```mermaid
erDiagram
    %% <context>
    <PARENT> ||--o{ <CHILD> : has
    <PARENT> {
        uuid id PK
        text name
        timestamptz created_at
        timestamptz updated_at
    }
    <CHILD> {
        uuid id PK
        uuid parent_id FK
        timestamptz created_at
    }
    %% <other context>
    <OTHER> ||..o{ <CHILD> : "id only"
```

## Context ownership

<!-- instruction: one row per table. Matches the SAD §5 ownership table; a difference is a finding
     for the audit. "Referenced by" lists other contexts that hold this table's id without a FK. -->

| Table | Owning context | Aggregate root | New / existing | Referenced by (id only) |
|---|---|---|---|---|
| `<table>` | `<context>` | `<root entity>` | new | `<other context>` |

## Entities

<!-- instruction: one subsection per table, grouped by context then aggregate. Rules file applies:
     uuid PK DEFAULT gen_random_uuid(); text + CHECK (char_length) bounds from the AC; money bigint
     minor units + currency; date vs timestamptz by meaning; created_at + updated_at with
     set_updated_at() for mutable rows, created_at only for append-only rows; CHECK only for stable
     invariants; no business DEFAULT. -->

### `<table>` (`<context>`)

| Column | Type | Constraints | Origin | Notes |
|---|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` | - | |
| `<name>` | `text` | NOT NULL, `CHECK (char_length(<name>) BETWEEN 1 AND <N>)` | AC-<n> | bound N from the AC |
| `<amount>_minor` | `bigint` | NOT NULL, `CHECK (<amount>_minor > 0)` | AC-<n> | kopiyky |
| `<parent>_id` | `uuid` | NOT NULL, FK -> `<parent>(id)` | SAD §5 | same context; indexed |
| `<other>_id` | `uuid` | NOT NULL | SAD §5 | id of `<other context>.<table>`, no FK (ADR 0002) |
| `created_at` | `timestamptz` | NOT NULL `DEFAULT now()` | - | |
| `updated_at` | `timestamptz` | NOT NULL `DEFAULT now()`, trigger `set_updated_at` | - | omit for append-only rows |

**Mutability:** mutable | append-only (<why; ADR if a guard trigger is added>).
**Unique keys:** `<table>_<cols>_key` on `(<cols>)` - serves §5.1 `<context>.<error_name>`.
**State column:** `<state>` `CHECK (<state> IN (...))` - states from PRD §10; transitions in Go.

## Indexes

<!-- instruction: one row per index in the migrations. No index without a query. -->

| Index | Table | Columns | Kind | Query it serves |
|---|---|---|---|---|
| `<table>_<cols>_idx` | `<table>` | `(<cols>)` | btree | `<QueryName>` |

## Query -> index map

<!-- instruction: one row per planned sqlc query (`-- name: X :one|:many|:exec`) and per SAD §6
     read/write. Every row ends in an index, "PK", or "seq scan accepted: <row estimate>". -->

| Query (sqlc name) | Context | Flow / AC | WHERE / ORDER BY | Served by |
|---|---|---|---|---|
| `<GetX>` | `<context>` | SAD §6 <flow> / AC-<n> | `id = $1 AND association_id = $2` | PK |
| `<ListX>` | `<context>` | AC-<n> | `association_id = $1 ORDER BY created_at DESC, id DESC` | `<table>_association_id_created_at_idx` |

## Error catalogue -> constraints

<!-- instruction: from PRD §5.1 (ao-prd). Each conflict / uniqueness / invariant code: the DB
     constraint that backs it, or "app only" with the reason (changeable rule, cross-table). -->

| Code | Kind | Backed by | Notes |
|---|---|---|---|
| `<context>.<error_name>` | conflict | `<table>_<cols>_key` | mapped to 409 in the adapter |
| `<context>.<error_name>` | invariant | app only | business rule that can change |

## Migration plan / expand-contract map

<!-- instruction: from PRD §9 and the brownfield diff. One row per staged file, same order as
     migrations/MANIFEST.md. Phases of one expand/contract sequence ship in separate PRs. -->

| Order | Staged file | Change | Phase | Ships in | Down | Backfill note |
|---|---|---|---|---|---|---|
| 1 | `NNNNN_create_<table>.sql` | new table | - | PR 1 | drop table | - |
| 2 | `NNNNN_add_<table>_<column>.sql` | nullable column | expand | PR 1 | drop column | - |
| 3 | `NNNNN_backfill_<table>_<column>.sql` | fill existing rows | backfill | PR 2 | no-op (documented) | `backfill-<table>-<column>.md` |
| 4 | `NNNNN_contract_<table>_<column>.sql` | NOT NULL | contract | PR 3 | drop NOT NULL | - |

**Reversibility:** <what a rollback of the feature does to stored rows; PRD §9>.

## Deviations from the rules

<!-- instruction: every place this model departs from .claude/rules/migrations.md, each with the ADR
     that allows it. No ADR -> not a deviation, a self-check FAIL. Write "None" if empty. -->

| Rule | Deviation | Where | ADR |
|---|---|---|---|
| triggers: only `set_updated_at` | immutability guard rejecting UPDATE/DELETE | `<table>` | [ADR <n>](./adr/<file>.md) |

## Seeds

<!-- instruction: bootstrap rows (fixed uuid, ON CONFLICT DO NOTHING) and closed-set lookups.
     Write "None" if empty. -->

- `NNNNN_seed_<table>.sql` - <what and why the app needs it to start>.

## Test fixtures

<!-- instruction: Go helpers in the context's test package or next to testdb, never migrations.
     PII guard: example.test e-mails, made-up names. -->

- `<newX>(t, pool, ...)` - <what it inserts>.

## Drift

<!-- instruction: schema vs source (domain structs, sqlc rows) and model vs spec (PRD, SAD). -->

- Schema vs source: <none | finding -> migrations/_drift/<file>.sql>.
- Model vs spec: <none | PRD entity / SAD table without a home, table without an origin>.
