# API contract rules — baseline

<!-- Bootstrapped by petforge/.claude/skills/ao-api-forge on the first HTTP run. Edit freely. -->
<!-- ao-api-forge reads this file on every run; a team edit here, or an ADR, is the only way to deviate, and the deviation is recorded in api-sync-report.md. -->

## Where the contract lives

- `services/core/api/openapi.yaml` is the only contract (OpenAPI 3.1.0). Handlers, the TS client,
  mocks and tests follow it; generated code is never edited (`*.gen.go`, `apps/web/src/api/gen/`).
- A feature designs its change as a delta in `docs/features/<slug>/contracts/openapi.yaml`
  (`/ao-api-forge <slug>`), proven by a scratch codegen, and merged into the contract by the task that
  implements it, followed by `mise run gen`.
- After a hand edit or an upstream change run `/ao-api-forge <slug> --reconcile` so
  `api-sync-report.md` stays true. `info.version` bumps only with a CHANGELOG line.

## Hard rules

- Every operation: exactly one tag = its bounded context, a path under `/<context>/`, an
  `operationId` (lowerCamel verb + noun, unique), examples with placeholder data only.
- Every schema in `components/schemas`, used through `$ref`; no inline schemas, no
  `additionalProperties: true` on responses, no multi-type unions, nullability as `type: [T, "null"]`.
- Errors are RFC 9457 `application/problem+json` through `internal/platform/httpapi`. Validator and
  router errors keep `type: about:blank`; every domain error has
  `type: urn:problem:<context>.<error_name>` with a code from the feature PRD's error catalogue.
- Status by kind: validation 422 (with `errors[].pointer`), not_found 404, invariant / conflict 409,
  authorization 403, authentication 401, unavailable 503. A 403 never reveals whether the target exists.
- No real PII in examples: `<name>@example.test`, «Тестовий Член Правління», zero-padded UUIDs.

## Defaults

- No version in the URL; no `/api` in spec paths (the web client adds it).
- `SessionCookie` (`apiKey` in cookie) global; `/system/health` and sign-in operations declare
  `security: []`.
- Lists: `limit` (1..100, default 20) + opaque `cursor`; response `{items, next_cursor}`; keyset on
  `(created_at, id)` newest first; never offset.
- Field constraints mirror the migration: `char_length` CHECK -> `minLength`/`maxLength`,
  `CHECK IN` -> named enum, minor-unit `bigint` -> `int64` + `Currency`, `date` vs `date-time`.
- Edits of a revisioned aggregate carry `revision`; stale -> 409.
- Background work is a River job: ids-only payload, unique key, retries, trace context
  (`contracts/events.md`).

## Checks

- Before merging a delta: scratch `oapi-codegen` + `go build` and scratch orval (see the skill's
  `references/codegen-check.md`).
- After merging: `mise run gen`, `mise run gen:check`, `mise run lint`, `mise run test`.
- A contract change and its handler / client land in the same PR with `api-sync-report.md` at
  `PASS` or `PASS (with deferrals)`.
