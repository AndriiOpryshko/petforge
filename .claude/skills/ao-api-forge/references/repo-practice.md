# Repo practice — what ao-api-forge derives against

Defaults for a Go modular monolith + React client laid out like
[spilno](https://github.com/AndriiOpryshko/spilno), checked against its `services/core/api/openapi.yaml`,
`internal/platform/httpapi`, `migrations/`, codegen configs and `docs/adr/0003-spec-first-codegen.md`
(October 2026). Read the target repo first; where it differs, the repo wins and the difference goes
to the report's merge notes.

## One contract, one tag per context

- The repo has exactly one contract: `services/core/api/openapi.yaml` (OpenAPI 3.1.0, `servers:
  http://localhost:8080`). The web dev server proxies `/api/*` to it; orval's `baseUrl: '/api'`
  adds the prefix on the client, so **paths in the spec have no `/api` and no version**.
- Every operation has exactly one tag = its bounded context (`system`, `finance`, `governance`, a
  new one such as `identity`), and its path starts with `/<context>/`.
- Each context generates its own server with `include-tags: [<bc>]` (models, chi-server,
  strict-server, embedded-spec, `always-prefix-enum-values`). A component used by two contexts is
  generated once per context.
- The feature contract is a **delta**: a self-contained, valid OpenAPI document holding the new
  paths, the new components and copies of every repo component it references (`Problem`,
  `FieldError`, `NotFound`, `UnprocessableEntity`, `Currency`, ...). A copied component keeps the
  repo shape byte for byte; a change to one is a merge note, not a silent edit.
- A new context (tag) in the delta adds to the report the wiring checklist from `CLAUDE.md`: tag in
  the spec, `adapters/http/gen/oapi-codegen.yaml`, `sqlc.yaml` entry, `<bc>-private` depguard
  rule, line in `cmd/api/main.go`.

## Naming

- `operationId`: lowerCamel verb + noun, unique in the merged contract (`createMeeting`,
  `listMeetings`, `getMeeting`; for commands `withdrawProtocol`, `castPollVote`). oapi-codegen turns
  it into the `StrictServerInterface` method, orval into the hook name (`useListMeetings`).
- Schemas: `New<Entity>` (create body), `<Verb><Entity>Request` (command body), `<Entity>` (response),
  `<Entity>Page` (list), `<Entity><Field>` for a named enum (`MeetingKind`). JSON keys snake_case.
  Names come from the CONTEXT glossary's English column.
- Responses list every column in `required`, nullable ones typed `[T, "null"]` (as `Meeting.ends_at`).
  Request bodies require only NOT NULL columns without a default and set `additionalProperties: false`.

## Field mapping from DDL

Sources in order: `data-model.md` (or `data-model.ao-data-model.md`), the staged
`docs/features/<slug>/migrations/*.sql`, then `services/core/migrations/*.sql` for existing tables.

| DDL | OpenAPI | Repo example |
|---|---|---|
| `uuid` PK / FK `<entity>_id` | `type: string, format: uuid` | `Meeting.id` |
| `text` + `CHECK (char_length(x) BETWEEN a AND b)` | `minLength: a, maxLength: b` | `NewMeeting.title` 1..200 |
| `text` + `CHECK (char_length(x) <= N)` | `maxLength: N` | `NewMeeting.location` |
| `varchar(N)` | `maxLength: N` | - |
| `text` + `CHECK (x IN ('A','B'))` or a Postgres ENUM | named enum schema via `$ref`, values verbatim | `MeetingKind`, `Currency` |
| `bigint` minor units (`amount_cents`, `CHECK > 0`) | `integer, format: int64, minimum: 1` + sibling `currency: $ref Currency` | `NewContract.amount_cents` |
| `integer` / `bigint` (counts, revisions) | `integer` `int32` / `int64`, `minimum` from CHECK | - |
| `numeric(p,s)` | `string` + decimal `pattern` (never `number`) | - |
| `date` (Europe/Kyiv calendar day) | `format: date` | `Contract.signed_at` |
| `timestamptz` | `format: date-time` | `Meeting.held_at` |
| `boolean` + `DEFAULT` | `boolean` + `default` on the request side only | `NewMeeting.quorum_required` |
| nullable column | `type: [T, "null"]` | `Meeting.ends_at` |
| `jsonb` | a named object schema from data-model, never a free object | - |
| file (Drive id + sha256) | upload: `multipart/form-data` with `type: string, contentMediaType`; response: metadata schema | - |
| multi-column CHECK (`ends_at > held_at`) | not expressible: a `description` + a domain 422 with a field pointer | `NewContract.ends_at` |
| `created_at`, `updated_at`, triggers | response-only fields | `Meeting.created_at` |

A field that exists only in the response (computed) gets confidence `medium`; a field read only
from a §6 message gets `low`.

## Errors and status mapping

What `internal/platform/httpapi` emits today:

- Schema validation failures from the request validator -> **422** `Validation failed` with
  `errors: [{pointer, detail}]` (`/query/limit`, `/title`). Unknown route -> 404, wrong method -> 405,
  body decode / bind failures -> 400, response errors -> 500. All with `type: about:blank`.
- Handlers return `gen.<Op>404ApplicationProblemPlusJSONResponse` etc., also with `about:blank`.
- Authentication is not enforced by the validator (`NoopAuthenticationFunc`); the session
  middleware enforces it.

Feature contract rule: the generic validator / router errors keep `about:blank`; every **domain**
error carries `type: urn:problem:<context>.<error_name>` with the code from ao-prd §5.1
(regex `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`), `title` = the catalogue message, `status` per kind:

| §5.1 kind | Status | Reusable response |
|---|---|---|
| validation | 422 (`errors[].pointer` per field) | `UnprocessableEntity` |
| not_found | 404 | `NotFound` |
| invariant, conflict | 409 | `Conflict` |
| authorization | 403 | `Forbidden` |
| authentication | 401 | `Unauthorized` |
| unavailable | 503 (+ `Retry-After`) | `ServiceUnavailable` |

The repo has no error registry; codes live as domain sentinel errors mapped in `adapters/http`.
Until handlers set the `urn:` type, drift point 2 is `✓ (deferred: handlers emit about:blank)`.
A 403 for a non-member is the same body whether the target exists or not.

## Pagination

Repo keyset pagination (`listMeetings`, `listContracts`): query `limit` (1..100, default 20) and
`cursor` (opaque string, `minLength: 1`, from the previous page); response `{items, next_cursor}`
with `next_cursor: [string, null]`. The cursor is base64url of `(created_at, id)`, ordered newest
first; a malformed cursor answers 422. No `before`, no `has_prev`, no offset.

## Auth

ADR (feature) "sign in through OIDC (Google first) with server-side sessions in Postgres": HttpOnly,
Secure, SameSite=Lax session cookie; membership checked per request. In OpenAPI:
`components.securitySchemes.SessionCookie: {type: apiKey, in: cookie, name: <cookie name from the
ADR or the identity code>}`, global `security: [{SessionCookie: []}]`, `security: []` on
`/system/health` and the sign-in / callback operations. If the repo contract has no scheme yet, the
delta introduces it and the report notes that every existing operation becomes protected.

## Concurrency and async

- A revisioned aggregate (draft with `revision`) takes `revision` in every edit body; stale -> 409
  with the catalogue's conflict code.
- Background work runs in `cmd/worker` on River. The HTTP operation that enqueues returns the
  committed state (200/201), not 202, unless the SAD says otherwise; the job outcome shows in the
  resource's state field. Job contracts go to `events.md`.

## Codegen tools

- `oapi-codegen` and `sqlc` are pinned in `services/core/tools/go.mod` and run through
  `go tool -modfile=tools/go.mod` from `services/core` (oapi-codegen v2.8.0 at the time of writing -
  read the `require` line, do not trust this number).
- `scripts/gen.sh` runs every `internal/*/adapters/http/gen/oapi-codegen.yaml` against
  `api/openapi.yaml`; `mise run gen` also runs `pnpm --filter @spilno/web gen:api` (orval 8.x,
  `react-query`, `fetch`, `tags-split`, `forceSuccessResponse`).
- `mise run gen:check` fails when generated code is stale; `mise run lint` runs golangci-lint (with
  depguard), eslint and tsc.
