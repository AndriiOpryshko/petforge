---
id: Q3
title: "<imperative, specific title>"
layer: infra             # implement-tasks enum: migration|domain|infra|app|ports|ui|tests|wiring|docs
ao_layer: sqlc           # wiring|migration|sqlc|domain|app|http|job|web|e2e|docs
context: governance      # bounded context = services/core/internal/<context>/
deps: [M6]               # same as tasks.json
acs: [AC-03]             # chosen PRD §5, Stage 1 only
adrs: ["0016"]           # ADRs that constrain this task
errors: [governance.protocol_not_found]   # §5.1 codes this task produces or maps
files_hint: [services/core/internal/governance/adapters/postgres/queries/protocols.sql, services/core/internal/governance/adapters/postgres/protocols.go]
est: M                   # S = 2h, M = half-day, L = day; more -> split
owner: "<TBD lead>"
status: todo
---

# Q3 - <title>

## Why

<!-- instruction: 1-2 sentences, links only: derives from [AC-03](../<prd>#ac-03-us-02--happy-path),
SAD §6 flow "<name>" ([<sad>](../<sad>)), [ADR 0016](../<adr_dir>/0016-....md), data model
query -> index row "<query>". -->

## What

<!-- instruction: the concrete change in one layer of one context, ≤1 day / one PR, the same paths as
files_hint. Name the queries / types / use case / operationIds / route / component / story states.
Migration task: the staged file(s) by name and the promote command. HTTP task: which operations of
the delta it merges (first http task of the context: all of them, with 501 stubs). Web task: which
existing primitives it composes. -->

## Definition of Done

<!-- instruction: common lines + the layer lines from references/dod-catalogue.md, filled in.
Every bullet has a command or an observable result. Example for an sqlc task: -->
- [ ] Proves AC-03 (draft created in state чернетка for the meeting) at the storage level - `TestProtocols_Create` in `protocols_test.go`.
- [ ] Queries `CreateProtocol`, `GetProtocol`, `ListProtocols` in `queries/protocols.sql`; `mise run gen && git diff --exit-code` clean.
- [ ] Org filter: each query has `WHERE association_id = @association_id` (ADR 0016); `TestProtocols_OtherAssociationInvisible` gets `governance.protocol_not_found` for a row of another association.
- [ ] `ListProtocols` is keyset over `(created_at, id)` using index `protocols_association_created_idx`.
- [ ] `cd services/core && go test ./internal/governance/adapters/postgres/...` green on `testdb.New(t)`.
- [ ] `mise run lint` clean; no hand edit under `sqlcgen/`.

## Verification

<!-- instruction: the exact commands in run order, copy-paste ready, from the repo root. -->
```bash
mise run gen && git diff --exit-code
mise run lint
(cd services/core && go test ./internal/governance/...)
```
On `feature-1/*` / `feature-2/*`: `LOG.md` `check` line per command and a `commit` line after the commit.

## Notes

<!-- instruction: lane shared with another task (same files_hint), gotchas from CLAUDE.md
(goose StatementBegin, r.Group not r.Mount, :5180 proxy), hard rules it must respect. -->
