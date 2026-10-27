<!-- Template for ao-api-forge — copied to contracts/events.md (or contracts.ao-api-forge/events.md) -->
<!-- ONLY when `worker` is a target surface or a sad.md §6 flow enqueues a River job. One `## Job` -->
<!-- block per job kind in §6 / §8. Numbers (attempts, timeouts) come from the SAD and ADRs, never invented. -->
---
status: Draft
owner: "<Backend Lead>"
updated_at: "<YYYY-MM-DD>"
skill: ao-api-forge
---

# Async contract — <feature>

Background work runs in `cmd/worker` on River (Postgres-backed queue, no broker). The HTTP
operation commits the state change and inserts the job **in the same transaction**; the job's
outcome becomes visible through the resource's state, not through a callback. Derived from the
§6 flows: every job here maps to an enqueue message in a diagram.

## Rules for every job

- **Payload carries ids only:** association, aggregate, revision, file id. Never document text,
  names, emails, amounts or other personal data — the handler re-reads them through its own ports.
- **Idempotency:** the handler checks the target state first and returns success if the work is
  already done; River `UniqueOpts` by the key below stops duplicate inserts.
- **Trace context:** the W3C `traceparent` of the enqueuing request goes into the job metadata, so
  the worker span joins the request trace.
- **Retry:** River retries with its backoff up to `MaxAttempts`; after the last attempt the job is
  discarded and an alert fires (SAD §7 / §10).
- **Evolution:** args are additive only; removing or renaming a field is a new kind
  (`<kind>_v2`). The worker ignores unknown fields.

## Job: `<kind>`

<!-- The River Kind() string named in the SAD (for example `render_pdf`). -->

- **Enqueued by:** `<operationId>` in `<context>` (sad.md §6 Flow <N>, AC-<NN>).
- **Worked by:** `cmd/worker`, `internal/<context>/jobs/<kind>.go`.
- **Unique key:** `<kind>` + `<aggregate_id>` + `revision` (River `UniqueOpts{ByArgs: true}`).
- **Max attempts / timeout:** `<N>` / `<duration>` (source: <ADR or SAD §>).
- **On success:** `<resource>.<state field>` becomes `<value>`.
- **On discard:** `<what the member sees, which §5.1 code if any>`.

```json
{
  "association_id": "00000000-0000-7000-8000-000000000001",
  "<aggregate>_id": "00000000-0000-7000-8000-000000000002",
  "revision": 3
}
```

| Field | Type | Origin |
|---|---|---|
| `association_id` | uuid | data-model.md -> `<table>.association_id` |
| `<aggregate>_id` | uuid | data-model.md -> `<table>.id` |
| `revision` | int32 | data-model.md -> `<table>.revision` |

## Periodic jobs

| Kind | Schedule | Reads | Writes | Alert |
|---|---|---|---|---|
| `<kind>` | `<cron / interval>` | `<tables>` | `<tables>` | `<metric and threshold>` |
