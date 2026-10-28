# Slicing template - the repo's vertical layers

One task = one layer of one context, ≤1 day, one PR. Work through the contexts in the SAD §5
ownership table; inside a context, through the layers in this order. Skip a layer the feature does
not touch, never merge two.

| # | `ao_layer` | Course `layer` | Id prefix | One task is | Source |
|---|---|---|---|---|---|
| 0 | `wiring` | `wiring` | `W` | a new context's five wiring points + empty `module.go` | SAD §5 "New?" column, CLAUDE.md |
| 1 | `migration` | `migration` | `M` | one aggregate's staged migrations (or one expand / backfill / contract step) promoted with `/promote-migration` | data model, staged files, PRD §9 |
| 2 | `sqlc` | `infra` | `Q` | one `queries/<aggregate>.sql` file + the Postgres adapter implementing its port | data model query -> index map, SAD §6 reads/writes |
| 3 | `domain` | `domain` | `D` | one aggregate: types, invariants, state machine, sentinel errors | CONTEXT Invariants + Sentinel errors, PRD §5.1, §10 |
| 4 | `app` | `app` | `A` | one use case (often one §10 transition) + the ports it needs | PRD §10 allowed transitions, SAD §6 flow |
| 5 | `http` | `ports` | `H` | the operations of one use case: delta merged, `mise run gen`, strict-server method(s), problem+json mapping | contract delta, `x-problem-types` |
| 6 | `job` | `infra` | `J` | one River job: args (ids only), worker, enqueue in the caller's transaction | `events.md`, SAD §6 async flows |
| 7 | `web` | `ui` | `U` | one screen or one feature component with its stories (one story per state) | SAD §5 web tree, `design-spec.md`, existing `src/features/<bc>/` |
| 8 | `e2e` | `tests` | `E` | one Playwright spec for one user story's happy path + its key refusal | PRD §4 story, its ACs |
| 9 | `docs` | `docs` | `X` | ADR follow-up, runbook, README line | SAD §11, ADR "Migration" blocks |

Ids are `<prefix><n>` (`M1`, `Q3`, `A5`): the id shows the layer; numbering follows the DAG order.

## Per layer

- **wiring** - only for a context the SAD marks new. Every other task in that context depends on it.
- **migration** - group the staged files by aggregate (all identity tables, the protocol aggregate,
  the poll aggregate, ...); a group is one task when its promote + roundtrip fit a day. Each
  expand / backfill / contract step of an existing table is its own task, in a chain, because
  each ships in its own PR and deploy. Seed/bootstrap migrations ride with their table. Migration
  tasks form one chain (the engine serializes them anyway); order = staged order.
- **sqlc** - one task per query file / port. Depends on the migrations that create its tables.
  Every query lists its `association_id` filter (or `org-filter: n/a <reason>`).
- **domain** - pure Go; no deps on migration or sqlc tasks, so it runs in parallel with them. The
  state-machine task carries the full §10 table: each allowed row is a test case, each refused row
  is a test case returning its sentinel. Split one aggregate's domain only by sub-aggregate, not by
  transition.
- **app** - one task per §10 allowed transition that has its own use case (create draft, open poll,
  return to draft, print, lock, withdraw), plus one per non-transition use case (settings, roster,
  cases, registry search). Two transitions that share one use case (`чернетка -> готовий до
  підпису` and `готовий до голосування -> готовий до підпису`) stay one task with both ACs.
  Depends on the domain task and the sqlc task(s) whose ports it calls; authorization (board term
  in force on the action date) lives here.
- **http** - one task per app task. The first `http` task of a context also merges that context's
  delta (paths, schemas, shared responses) into `services/core/api/openapi.yaml`; later `http`
  tasks of the context depend on it and only add their handler methods. Merging the whole delta at
  once keeps `mise run gen` stable. The handler must implement the whole generated
  `StrictServerInterface` to compile, so that first task adds one stub method per new operation
  returning `501` problem+json; each later `http` task replaces its stubs.
- **job** - one per River job in `events.md`; depends on the app task that enqueues it and the
  sqlc task it writes through. Worker wiring (`cmd/worker/main.go`, `module.RegisterWorkers`) is a
  `wiring` task when the process is new.
- **web** - one per screen (route) and one per non-trivial feature component; depends on the
  `http` task whose operations it calls (the hooks exist after its `mise run gen`). Components
  that only take props (stories with mock data) may depend on nothing but the design spec.
- **e2e** - one per PRD §4 story in Stage 1 (or per two small ones); depends on the `web` and
  `http` tasks of that story. The last e2e task's DoD runs `/green`.

## Stage scope

Only Stage 1 ACs (headings without a `_(Stage 2 ...)` / `_(dropped ...)` marker and before
"Deferred to Stage 2") get tasks. Deferred ACs and their §5.1 codes go to `_epic.md` Out. Stage 0
prerequisites in PRD §9 (sign-in, association record) are Stage 1 tasks that come first in the DAG.

## Sizing

`est`: S = 2h, M = half-day, L = day; anything bigger is split. Expected count for an L feature
with three surfaces is 30-50 tasks; a size-M backend-only feature 10-20 (see
[size matrix](./shared/size-matrix.md)). More than 60 -> ask whether to split the epic per story
group (one `tasks/` per sub-epic is not supported by implement-tasks; prefer one DAG).

## Worked example (board-protocol, ao set, abridged)

```
W1  identity context wiring                                  wiring
M1  identity tables + bootstrap association (5 staged)       migration   W1
M2  board_members + association_settings                     migration   M1
M3  meetings.association_id expand                           migration   M2
M4  meetings.association_id backfill                         migration   M3
M5  meetings.association_id contract (SET NOT NULL) + idx     migration   M4
M6  cases + protocols + agenda_items + slots + turns         migration   M5
M7  poll_rounds + print_copies + meeting_facts                migration   M6
M8  protocol_snapshots + immutability triggers (ADR 0007)     migration   M7
D1  protocol state machine + §5.1 sentinels                   domain      -
D2  roster, settings, slot confirmation rules                 domain      -
Q1  identity queries (accounts, sessions)                     sqlc        M1
Q2  roster + settings queries                                 sqlc        M2
Q3  protocol queries (create, get, revise, transitions)       sqlc        M6
A1  sign-in + RequireMember                                   app         Q1
A3  create draft (none -> чернетка; AC-03, AC-04, AC-45)      app         D1 D2 Q3
A5  print (-> готовий до підпису; AC-25, AC-25b, AC-06)        app         A3 Q4
H3  POST /governance/protocols (merges governance delta)      http        A3
U3  protocol screen: draft state + stories                    web         H3
E1  draft -> print -> lock happy path                         e2e         U3 U5 U6
```
