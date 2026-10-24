# Stack defaults - what ao-prd proposes before asking

Defaults for a Go modular monolith (chi + oapi-codegen strict server, sqlc + pgx, Postgres, goose)
with a React web client, serving one or a few housing associations. The skill proposes these
values in the draft; the Socratic walk confirms or changes each one. They are starting points,
not facts: a changed value goes to the edits-log with the user's reason.

## Error codes (§5.1)

- Format: `<context>.<error_name>`, both parts snake_case ASCII, matching
  `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.
- `<context>` is the bounded context that owns the rule: a folder under
  `services/<svc>/internal/<context>/` (for example `governance`, `finance`) or a context the PRD
  plans to add (marked `planned` in §5.1).
- `<error_name>` names the broken rule, not the HTTP outcome: `quorum_not_met`,
  `decision_outside_competence`, `protocol_locked`, `amount_without_source`. Never `bad_request`,
  `forbidden`, `error_1`.
- Kinds in §5.1: `validation` (input shape, one per field group), `invariant` (domain rule),
  `authorization` (role or membership), `not_found`, `conflict` (concurrent change, stale version).
- Not-found codes follow the existing sentinels: `ErrMeetingNotFound` in `governance/domain` ->
  `governance.meeting_not_found`.
- Wire form: RFC 9457 `application/problem+json` (`internal/platform/httpapi`). The code is carried
  in the problem `type` (default `urn:problem:<context>.<error_name>`); `api-forge` fixes the final
  URI and status. §5.1 never names a status number.
- Authorization codes for objects of another association use the not-found code, so their
  existence is not revealed.

## NFR defaults (§6)

| Aspect | Default target | Measurement |
|---|---|---|
| Latency p95, read or list of one association's records | <= 200 ms | server request-duration histogram per route |
| Latency p95, write without file | <= 500 ms | same histogram |
| Latency p95, upload of a signed scan | <= 3 s for 20 MB | same histogram, upload routes |
| Generated document (protocol, export) | <= 5 s p95 | job or request duration |
| Throughput | >= 50 req/s per instance on the read path | load smoke test in CI |
| Availability | 99.5 % monthly | uptime check on the health endpoint |
| Durability | RPO <= 24 h, RTO <= 4 h | daily backup + restore drill per quarter |
| File size | <= 20 MB per file, PDF / JPEG / PNG | upload validation |
| Retention | signed records kept >= 5 years, never hard-deleted | storage policy |
| Integrity | a locked record changes only through a new referencing record | integrity check job, 0 mismatches |

A feature that writes money or legal records keeps Durability, Retention and Integrity even when
the user asks to drop rows; dropping one goes to §8 with owner and due.

## RBAC (§10)

Roles come only from the feature's `CONTEXT.md` glossary. Typical OSBB roles the glossary
usually defines, and what they usually may do:

| Role | Typical rights |
|---|---|
| голова правління | everything a board member may, plus signing on behalf of the association |
| головуючий | prepares and signs the protocol of the meeting they chair |
| член правління | reads all board records of the association, prepares drafts, votes |
| ревізійна комісія / ревізор | reads signed records and exports, never edits |
| співвласник | reads what the general meeting or the charter makes public |
| управляюча компанія | uploads its own documents (estimates, acts), reads nothing else |

Rules the matrix must state: scope is one association (no cross-association reads); rights come
from a board term in force on the date of the action; a person whose term ended keeps no rights.

## State machine (§10)

Reference shape for a legally meaningful document (protocol, decision, act). Adapt the states to
the feature; keep the properties.

```
Чернетка --(готовий до підпису)--> На підписі --(завантажено підписаний примірник)--> Підписаний
   ^                                   |                                                    |
   +--------(повернуто на доопрацювання)                                     (нове рішення скасовує)
                                                                                            v
                                                                                       Скасований
```

Properties: one terminal path from Draft to Signed; Signed is immutable; cancellation is a new
record that references the old one, never an edit; every refused transition (edit a signed
record, sign with blocking checks open, skip a state) has an AC.

## OSBB edge cases (for «Add edge case»)

Offer the ones that fit the AC under review:

- a board member leaves or joins mid-meeting, so quorum changes for one agenda item;
- the board's term or composition changes between the meeting and the signing;
- two case documents give different amounts for the same line;
- a number has no source document in the case;
- the decision needs the general meeting, not the board;
- a new decision conflicts with a чинне рішення;
- the signed scan does not match the prepared draft;
- the same document is uploaded twice, or edited by two members at once;
- a correction is needed after signing.
