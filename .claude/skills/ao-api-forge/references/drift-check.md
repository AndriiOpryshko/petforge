# ao-api-forge — drift check, report shape, reconcile, conflicts

The contract is derived: data-model + migrations (types, constraints) + SAD §6 (error branches,
async actors) + PRD §4/§5/§5.1/§10 (operations, codes, refusals) -> OpenAPI delta. This file is the
detail for protocol step 9. The report template is
[`../templates/api-sync-report.md`](../templates/api-sync-report.md).

## Report — verdict first, written on every run

`api-sync-report.md` next to the YAML, **FAIL included** (a failing state that lives only in the
chat is gone after `/clear`). First line after the title:

```
**Verdict:** PASS | PASS (with deferrals) | FAIL
```

| Verdict | Rule |
|---|---|
| `PASS` | Scenario A. All 9 points ✓ (plain or accepted as is). `unresolved_origins` empty. `Deferrals`: none. |
| `PASS (with deferrals)` | Core points (1-3, 6-9) ✓, but something is consciously parked with a next step: scenario B, a supporting point 4-5 `✓ (deferred: …)`, a Save-as-OQ, a sequence gap, a default deviated from without an ADR, orval skipped, handlers still emitting `about:blank`. |
| `FAIL` | Any core point ✗ after resolution, ≥3 open flags, a field with no origin, or the scratch codegen failing. The report names the source to fix and the command; no handoff to `break-tasks`. |

Marks: **✓** (holds, or Accept-as-is with the reason), **✓ (deferred: one line)** (waits for a later
artifact or run), **✗ (one-line diagnostic)**.

## Section A — field origins

One row per `operationId.field`:

```
| schema_path                      | origin                                                  | confidence |
|----------------------------------|---------------------------------------------------------|------------|
| withdrawProtocol.reason          | data-model.md -> protocols.withdraw_reason (1..1000)    | high       |
| listProtocols.next_cursor        | repo convention (keyset cursor, listMeetings)           | high       |
| getProtocol.meeting.held_at      | services/core/migrations/00003 -> meetings.held_at      | high       |
| getProtocol.print_copy_url       | inferred from PRD AC-25, no column                      | low        |
```

high = a column with matching type and constraint; medium = PRD field name or computed response
field; low = a §6 message name only.

## Section B — the 9-point checklist

Forward (core):

1. **Operation ↔ data-model** — every operation reads or writes ≥1 entity (scenario B: maps to a
   PRD §4 story).
2. **Problem type ↔ repo error definition** — every `urn:problem:` code maps to a domain sentinel
   error / mapping in the context's `adapters/http`, in the form the repo uses. No registry or
   handlers still emitting `about:blank` -> `✓ (deferred: codes are the contract's proposal;
   implement-tasks maps them)`.
3. **Validation ↔ constraint** — `minLength` / `maxLength` / `minimum` / `enum` / `format` match the
   DDL per the field mapping in [`./repo-practice.md`](./repo-practice.md#field-mapping-from-ddl).
   Conflict -> take the stricter, flag both. Scenario B: `✓ (deferred: no data-model yet)`.

Back-feed (supporting):

4. **Entity / AC ↔ operation coverage** — every entity surfaced or marked intentionally internal
   (with why); every PRD §5 AC maps to ≥1 operation or response; every operation maps to a §4 story
   and ≥1 AC; every §10 refused action has a 403 or 409 on the operation that would perform it.
5. **OpenAPI ↔ sequence** — every §6 `alt`/`else` branch has a response; every response the contract
   needs but no §6 flow shows is a **sequence gap** (offer Fix the source first:
   `/sdlc:complete-sequence-diagrams <slug>` or `/ao-architecture <slug>`). A §6 message that
   already names an HTTP verb, path or status code is reported here as "sequence decides the
   contract" — the contract follows the domain message, the sequence gets a note.

Repo points (core):

6. **§5.1 catalogue ↔ problem types** — every Stage-1 code in PRD §5.1 appears in at least one
   operation's `x-problem-types` under the status its kind maps to; every code in `x-problem-types`
   is in §5.1 or listed in the report as "added beyond §5.1" with its source (SAD §8, ADR). Codes
   match `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`. A code the PRD and the SAD name differently (for
   example a membership 403) is a flag for the human.
7. **Lists ↔ cursor** — every operation returning a collection takes `limit` and `cursor` (via
   `components/parameters`), answers `<Entity>Page` with `next_cursor`, declares 422 for a bad
   cursor; no offset / page / `before`.
8. **Tag ↔ context ↔ path** — every operation has exactly one tag, the tag is an existing context
   or a new one with its wiring checklist in the merge notes, the path starts with `/<tag>/`, the
   `operationId` is unique across the delta and the repo contract.
9. **Delta ↔ repo contract and codegen** — every component that also exists in
   `services/core/api/openapi.yaml` has the same shape (or a merge note with a reason); no inline
   schema; every op has `operationId`; the scratch oapi-codegen generated and `go build` passed
   ([`./codegen-check.md`](./codegen-check.md)). Scratch orval failing is ✗; orval not runnable
   (no `node_modules`) is `✓ (deferred: …)`.

A core ✗ or ≥3 flags pauses the run before writing. Resolve each finding with one
`AskUserQuestion` ([`./shared/ask-style.md`](./shared/ask-style.md)):

- **Accept as is** -> ✓ with the reason recorded.
- **Fix the contract** -> regenerate that operation / schema, re-run the codegen check.
- **Save as open question** -> `Deferrals` entry with owner + due; the item keeps an `# unresolved` note.
- **Fix the source first** -> stop; the report is written with `**Verdict:** FAIL` and the command
  (`/ao-prd`, `/ao-architecture`, `/sdlc:complete-sequence-diagrams`, `/sdlc:generate-data-model`).
  This skill never edits a source artifact.

## Section C — unresolved_origins

Empty in A. In B: `schema_path | current origin | what reconcile would tighten`. Non-empty caps
the verdict at `PASS (with deferrals)`.

## Section D — Deferrals

`what | why parked | next step (command or owner + due)`. Write `none` on a plain `PASS`. The next
`--reconcile` reads this list first.

## Section E — merge notes for `services/core/api/openapi.yaml`

New tags, new components, components whose repo copy changes, the security scheme if the repo has
none yet (every existing operation becomes protected), the new-context wiring checklist, and the
`StrictServerInterface` methods the implementation must add.

## Reconcile (`--reconcile`)

1. Re-read every input, including the previous report's `Deferrals`.
2. Tighten types where the model now has a constraint; turn free strings into named enums.
3. Refresh confidence (`low`/`medium` -> `high` where a column backs the field).
4. Surface real drift: a field that had an inferred origin and now disagrees with the model.
5. Re-run the codegen check; re-derive the verdict; close or carry every deferral.

`info.version` is never bumped here.

## Conflict table

| Conflict | Action |
|---|---|
| Column with no PRD story | keep in the schema, `# unused-in-prd` note, ask |
| §6 flow with no operation | `# orphan-sequence` note, ask (forgotten operation? a River job?) |
| PRD constraint vs DDL constraint | stricter value, flag both |
| Existing contract field absent from every source | keep with `# manual-addition`, flag |
| Field gone from data-model | keep with `# stale`, surface it |
| Same component name, different shape in the repo contract | stop: rename or merge note, ask |
| PRD §5.1 and SAD §8 name one refusal differently | flag, ask which artifact is right |

≥3 flags in one run -> pause, list them, ask whether to continue or fix the sources first.
