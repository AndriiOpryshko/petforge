---
name: ao-data-model
description: >
  Standalone data model and migration writer for features of a Go + React modular monolith on
  Postgres 18 with goose v3 and sqlc (housing associations / OSBB and similar). Same flow as the
  course sdlc:generate-data-model - PRD + SAD gate, rules bootstrap, read inputs, aggregate roots,
  PK, columns, query-justified indexes, data-model.md with an ER check, staged migrations, seeds,
  drift check, expand/backfill/contract, self-check, audit, commit - rewritten for the repo's
  practice: goose files with Up/Down in one file, sequential 0000N_ names, uuid DEFAULT
  gen_random_uuid(), created_at + updated_at with the shared set_updated_at() trigger, text +
  CHECK on length, stable-invariant CHECKs allowed, no cross-context FKs, one index per sqlc query,
  and a schema roundtrip. Reads the ao-prd PRD (§5.1 error catalogue, §9 migration plan) and the
  ao-architecture SAD when present. Runs without the sdlc plugin. Writes
  docs/features/<slug>/data-model.md + staged migrations/ (or data-model.ao-data-model.md +
  migrations.ao-data-model/ next to another skill's data model). Triggers on
  "/ao-data-model <slug>", "ao-data-model for <slug>", "data model for <slug> with goose",
  "goose migrations for <slug>", "модель даних ОСББ", "міграції goose для <slug>".
argument-hint: "<slug> [--mode brownfield] [--drift-only]"
---

# ao-data-model

Turns an approved PRD and SAD into a data model and shippable goose migrations. Parallel to
`sdlc:generate-data-model`, not a replacement: it keeps the same 16-step protocol and the staged
migrations, and swaps the course's «DB as dumb storage» defaults for the target repo's practice
(see "What differs from sdlc:generate-data-model").

Shared mechanics are copied into `references/shared/` so the skill runs without the plugin:
[ask style](./references/shared/ask-style.md) · [mermaid check](./references/shared/mermaid-check.md) ·
[handoff](./references/shared/handoff.md). Repo practice:
[goose practice](./references/goose-practice.md) · [expand/contract](./references/expand-contract.md) ·
[self-check](./references/self-check.md) · [explorer prompt](./references/explorer-prompt.md).

## Audience

The tech lead answers. Questions in Ukrainian, plain words, every term glossed once
([ask-style](./references/shared/ask-style.md)); every option says which table, column or file it
changes. The board chair is asked only when a column carries a legal or retention meaning (what is
kept, for how long, whether it may ever be deleted).

## Inputs

- `<slug>`; flags `--mode brownfield` (ALTERs against existing tables only) and `--drift-only`.
- **Gate (hard refuse):** a PRD (`PRD.ao-prd.md` or `PRD.md`) and a SAD (`sad.ao-architecture.md`
  or `sad.md`) in `docs/features/<slug>/`. Missing -> «run `/ao-prd <slug>` / `/ao-architecture
  <slug>` (or the sdlc ones) first». If both variants of one exist, ask once which to design from
  and record the choice in the frontmatter (`prd:`, `sad:`).
- From an ao-prd PRD: §4-§5 ACs (entities, fields, limits), **§5.1 error catalogue** (every
  `conflict` / uniqueness code -> a UNIQUE constraint or a justified absence; `invariant` codes ->
  app or CHECK per the rules), **§9 migration plan** (existing tables touched -> expand/contract,
  backfills, reversibility), §10 state machine (state column, the transitions that write).
- From an ao-architecture SAD: §5 context-ownership table (which context owns which table), §6
  flows (each read or write -> a query -> an index candidate), §8, the ADRs (retention, triggers,
  scoping such as `association_id`). From a course SAD: §5, §6, §6.4 ER.
- Repo: `CLAUDE.md`, `docs/adr/*` (0002 contexts, 0004 migrations and queries),
  `services/core/migrations/*.sql`, `services/core/sqlc.yaml`, `mise.toml`, `infra/compose.yaml`,
  `services/core/internal/<bc>/adapters/postgres/queries/*.sql`, `.claude/rules/migrations.md`.

## Output and collision rule

- `docs/features/<slug>/data-model.md` from [`./templates/data-model.md`](./templates/data-model.md)
  (frontmatter `skill: ao-data-model`), staged goose files in `docs/features/<slug>/migrations/`
  with `MANIFEST.md`, backfill notes next to them, and `docs/features/<slug>/_audit/data-model-<date>.md`.
- If `data-model.md` exists and its `skill:` is not `ao-data-model`, never touch it or its
  `migrations/`: write `data-model.ao-data-model.md` and `migrations.ao-data-model/` (audit:
  `_audit/data-model.ao-data-model-<date>.md`). This is how the two skills are compared on one feature.
- Nothing is written into `services/core/migrations/` here. Promotion is a separate, explicit step
  ([goose practice](./references/goose-practice.md#promote)).

## Protocol

1. **Gate.** Check PRD + SAD per the gate above; pick the variants; apply the collision rule.
2. **Rules bootstrap.** If `.claude/rules/migrations.md` is absent in the target repo, copy
   [`./templates/rules-migrations-baseline.md`](./templates/rules-migrations-baseline.md) there and
   tell the user «I wrote a baseline rules file from CLAUDE.md and ADR 0004; edit it if the team
   disagrees». If it exists, it wins over the template; differences go to the audit.
3. **Repo scan.** One `Explore` (or `general-purpose`) subagent with the inline prompt from
   [`./references/explorer-prompt.md`](./references/explorer-prompt.md): last migration number,
   tables per context, existing indexes vs sqlc queries, triggers and functions, depguard contexts,
   Postgres version, domain structs for drift. Reconcile with
   [goose practice](./references/goose-practice.md); the repo wins.
4. **Read inputs** in this order: PRD ACs and §5.1 -> PRD §9 -> SAD §5 ownership -> SAD §6 flows
   -> ADRs -> (brownfield) the live migrations, parsed offline (Up sections only, no live DB).
5. **Aggregate roots and ownership.** One `AskUserQuestion` (or confirm the SAD §5 table): which
   aggregate owns what, and which **context** owns each table. A table has exactly one owning
   context; another context refers to it by id only (repo ADR 0002).
6. **PK.** `uuid PRIMARY KEY DEFAULT gen_random_uuid()` (repo practice). Ask only if an AC needs a
   natural key (a register number) - then it is a UNIQUE key next to the uuid, not the PK.
7. **Columns and constraints** per entity, per the rules file: `text` + `CHECK (char_length(...))`
   with the bound from the AC; money `bigint` minor units + `currency`; `date` for calendar dates,
   `timestamptz` for instants (Europe/Kyiv is a display concern); `created_at` + `updated_at` with
   the `set_updated_at()` trigger for mutable rows, `created_at` only for append-only rows (say
   which and why); CHECK only for stable invariants; every business rule that can change (limits,
   quorum numbers, charter thresholds) stays in Go. `<!-- TBD -->` where honestly undecided.
   Each §5.1 conflict code maps to a UNIQUE (or is noted as app-checked with the reason).
8. **Indexes per query.** Each SAD §6 read/write and each planned sqlc query (`-- name: X`) gets one
   row in the Query -> index map: the query, its WHERE / ORDER BY, the index that serves it, or
   «PK» / «seq scan accepted: <rows>». Every FK column gets an index. No «just in case» index.
9. **Write data-model.md** from the template: ER, entities by context, indexes, Query -> index map,
   Context ownership, Migration plan / expand-contract map, Deviations from the rules (each with an
   ADR), Test fixtures. Validate the `erDiagram` per
   [mermaid check](./references/shared/mermaid-check.md); never commit a broken one.
10. **Staged migrations.** In `migrations/` (or the collision path) write one goose file per change
    from [`./templates/migration-goose.sql`](./templates/migration-goose.sql) named
    `NNNNN_<verb>_<entity>.sql` (literal `NNNNN`, order in `MANIFEST.md`), per
    [goose practice](./references/goose-practice.md): `-- +goose Up` / `-- +goose Down` in one file,
    `StatementBegin/End` around functions and `DO` blocks, `-- +goose NO TRANSACTION` and a single
    statement for `CREATE INDEX CONCURRENTLY`
    ([`./templates/index-concurrently.sql`](./templates/index-concurrently.sql)). Greenfield: `CREATE TABLE` per entity (no
    `IF NOT EXISTS`: goose versions make re-runs impossible, and a silent no-op hides drift).
    Brownfield: ALTERs only.
11. **Seeds.** Bootstrap rows the app cannot start without (the one association) -> their own
    migration with a fixed uuid, idempotent `ON CONFLICT DO NOTHING`. Lookup data for a closed set
    -> prefer a CHECK enum; a lookup table only if rows carry attributes. Test fixtures -> Go helpers
    next to `testdb` or in the context's test package, never migrations. PII guard: `example.test`
    e-mails, «Тестовий Член Правління», no real names or phones.
12. **Drift.** Schema vs source: domain structs and sqlc rows vs columns (`field-without-column`,
    `column-without-field`, `type-mismatch`, `nullability-mismatch`), proposals staged in
    `migrations/_drift/`. Model vs spec: every PRD entity / §5.1 code / SAD §5 table has a home, and
    every table has a PRD or SAD origin. `--drift-only` stops after this step with the audit.
13. **Expand / backfill / contract** for every change to an existing table that PRD §9 or the diff
    implies (new NOT NULL, rename, re-type, drop, new FK or CHECK on a big table): three staged
    files from [`./templates/expand.sql`](./templates/expand.sql),
    [`./templates/backfill.sql`](./templates/backfill.sql),
    [`./templates/contract.sql`](./templates/contract.sql) plus a note from
    [`./templates/backfill-note.md`](./templates/backfill-note.md), each its own PR and deploy, per
    [expand/contract](./references/expand-contract.md). Dual write lives in Go, not in a trigger.
14. **Self-check** per [`./references/self-check.md`](./references/self-check.md): naming, Up/Down
    symmetry and exact restore, goose markers, FK indexes, every query has an index, banned
    features, no cross-context FK, sqlc parse. Offer to run the schema roundtrip and `mise run gen`
    on a scratch copy if the user agrees; never promote to make them pass. Any failure -> fix or
    surface it, no silent commit.
15. **Audit** `_audit/data-model-<date>.md`: staged paths and «staged, not live»; divergences from
    the rules file and existing debt found in the live schema; drift; expand/contract sequences;
    self-check results; TBDs with file:line.
16. **Commit and handoff.** In the target repo commit
    `04: data-model for <slug> via ao-data-model`. Print the handoff block
    ([handoff](./references/shared/handoff.md)): review `data-model.md` (Query -> index map,
    Deviations), `migrations/MANIFEST.md`; next `/sdlc:api-forge <slug>`, or the promote steps when
    the feature is being built now.

## What differs from sdlc:generate-data-model

| Step | sdlc:generate-data-model | ao-data-model |
|------|--------------------------|---------------|
| Gate | `PRD.md` + `sad.md` | either variant of each (`PRD.ao-prd.md`, `sad.ao-architecture.md`); asks which |
| Inputs | PRD §4, SAD §6.4 + §6 | + ao-prd §5.1 (-> UNIQUE), §9 (-> expand/contract), §10; ao-architecture §5 ownership, ADRs; repo ADR 0002/0004 |
| Runner | golang-migrate style `.up.sql` / `.down.sql` | goose v3: one file, `-- +goose Up/Down`, `StatementBegin/End`, `NO TRANSACTION` |
| File names | `YYYYMMDDhhmmss_` timestamps | `NNNNN_` placeholder + `MANIFEST.md`; renumbered to `0000N_` at promote (`goose create -s`) |
| Idempotency | `IF NOT EXISTS` everywhere | goose versioning; `IF NOT EXISTS` only in seeds/backfills that may resume |
| PK | UUID v7 app-side | `uuid DEFAULT gen_random_uuid()` |
| Audit columns | `created_at` only | `created_at` + `updated_at` + `set_updated_at()` trigger for mutable rows; `created_at` only for append-only |
| Strings | `VARCHAR(N)` | `text` + `CHECK (char_length(...))` |
| CHECK / triggers | all banned | CHECK for stable invariants; triggers only `set_updated_at` and ADR-approved immutability guards |
| Business DEFAULT | banned | banned; existing `DEFAULT 'REGULAR'` flagged as debt |
| Context boundaries | n/a | table owned by one context; no FK across contexts; ownership table |
| Indexes | one per sequence note | one per sqlc query and FK, in a Query -> index map |
| Expand/contract | described | three goose templates for Postgres 18 (CONCURRENTLY, batched DO, NOT VALID + VALIDATE) + backfill note + schema roundtrip |
| Self-check | 4 points | 4 adapted + goose markers, exact Down, query coverage, cross-context FK, sqlc parse |
| Explorer | `sdlc:explorer` | inline prompt for an `Explore` subagent |
| Commit | `feat(<slug>): data-model.md + staged migrations` | `04: data-model for <slug> via ao-data-model` |
| Output | overwrites `data-model.md` | `data-model.ao-data-model.md` + `migrations.ao-data-model/` next to another skill's model |

## Questions for discussion

- Which context owns each table; which references cross a context and so stay id-only?
- Which rows are append-only (no `updated_at`, maybe an ADR immutability trigger) and which mutable?
- Which invariants are stable enough for a CHECK, and which are business rules that will change?
- Which §5.1 conflict codes become UNIQUE constraints, and with which scope (`association_id`)?
- For each existing table touched: expand/contract, or is a short maintenance window acceptable?

## Definition of Done

- Data model at the collision-rule path with every template section filled or `<!-- N/A: reason -->`;
  the `erDiagram` parses; every index has a query; every table has an owning context.
- One staged goose file per change, listed in `MANIFEST.md`, with exact Down; nothing in the live
  `services/core/migrations/`.
- Self-check passes; deviations each cite an ADR; existing debt is listed in the audit.
- Audit written; commit `04: data-model for <slug> via ao-data-model`; handoff printed.

## Anti-patterns

- Writing into `services/core/migrations/` at design time: the API applies pending migrations on
  start (`postgres.Migrate`), so a half-designed file lands in every developer's database.
- A real sequence number in a staged file: two features grab the same `0000N_`.
- A CHECK that encodes a number the board or the charter can change (limit, quorum share).
- A trigger that is not `set_updated_at` and not backed by an ADR; a business-logic function.
- A FK to another context's table, or a query that joins it.
- A sqlc query without an index, or an index without a query.
- `CREATE INDEX CONCURRENTLY` without `NO TRANSACTION`, or with a second statement in the file.
- A Down that does not restore the exact previous schema (lost CHECK, default, index or trigger).
- Overwriting a data model written by another skill.
