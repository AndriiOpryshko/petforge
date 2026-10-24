---
status: Draft
skill: ao-prd
owner: "<feature owner>"
reviewers: ["<board chair or document owner>", "Tech Lead"]
updated_at: "<today YYYY-MM-DD>"
feature_size: "<from .size: XS/S/M/L/XL>"
stage: "03"
depth: "<easy|medium|hard>"
ticket: ""
---

# PRD — <slug>

<!-- Skill instruction: one-line links to inputs used.
> **Inputs:** [idea brief](./<idea-brief file used>) · [CONTEXT](./CONTEXT.md)
> **Reference context:** `services/<svc>/internal/<context>` — what was taken (entities, sentinels, status constants, authorization checks), or «N/A — no reference».
> **Other channels:** `docs/adr/NNNN-*.md`, other feature folders, or «None».
Status stays Draft. Approved is set by a human after reading. -->

## 1. Context

<!-- Skill instruction: 3-4 paragraphs, WHAT + WHY, no technology names.
¶1 The problem and who has it (brief §2, §3), in document terms: which document, who signs it, who checks it later.
¶2 Why now.
¶3 The committed approach from brief §13, including the AI boundary: what is rendered from data, what AI may write (wording, warnings), what a person must confirm.
¶4 Traceability: reference paths and ADRs read; deviations from the brief, each with a reason; critic overrides as «- Decision override: <headline> — rationale: <reason>». -->

## 2. Goals

<!-- Skill instruction: 2-3 outcomes as bullets, each a consequence of §1 ¶3. No numbers (they live in §7). -->

## 3. Non-goals

<!-- Skill instruction: at least 3 lines, each «<what> — <reason>». Sources: brief §5 Out of scope, and every scope cut made by a user-story Edit in the Socratic walk («— <reason>; was in US-NN before edit»). -->

## 4. User stories

<!-- Skill instruction: at least 5, no cap. One per acting glossary role and per §2 goal.

### US-NN: <3-6 word action title>  _(Stage N, if the brief phases the feature)_
**As a** <glossary role, verbatim>
**I want** <action on a document or decision>
**So that** <observable benefit>

Roles only from the glossary. Every US gets at least one AC in §5. -->

### US-01: <title>

**As a** <role>
**I want** <action>
**So that** <benefit>

## 5. Acceptance criteria

<!-- Skill instruction: Given/When/Then, business-observable, from the actor's view. No cap.
Seven coverage types, at least one each: happy / error / authorization / domain invariant / cross-context / traceability / legal competence.
Floors: an AC per retained US; an AC per allowed and per listed refused §10 transition; a §5.1 code for every error, invariant and authorization AC.
Edge cases go in as AC-NNb under the same US.

### AC-NN (US-XX) — <coverage type>
**Given** <role, state of the documents, prior events, the rule in force>
**When** <action>
**Then** <what the actor sees / what the system refuses and why / what is recorded>

FORBIDDEN here (critic F6 + pre-write scan): HTTP verbs, URL paths, status numbers, error-code strings (`x.y`), JSON, SQL or table names, technology names. Money is written with a currency («184 500 грн»).
Traceability AC name the source shown next to the value (case document, registry, charter, a person's confirmation).
Legal-competence AC name the rule that limits the body (charter clause, general-meeting competence, term in force). -->

### AC-01 (US-01) — happy path

**Given** <role> with <documents in state>
**When** <role> <action>
**Then** the system records <outcome> and shows <confirmation>

### AC-02 (US-01) — traceability

**Given** <role> preparing <document> with <value> taken from <case document>
**When** <role> opens <document>
**Then** every <value> shows the document it came from, and a <value> without a source is marked as unconfirmed

### AC-03 (US-01) — legal competence

**Given** <role> preparing a decision that the charter reserves for the general meeting
**When** <role> marks the document ready
**Then** the system refuses and names the rule that reserves the decision

## 5.1 Error catalogue

<!-- Skill instruction: one row per rule, not per AC. Code `<context>.<error_name>`, snake_case, `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`; context is an existing folder under services/*/internal/ or marked (planned). Kind: validation / invariant / authorization / not_found / conflict. Message is what the actor reads, in Ukrainian. No status numbers: api-forge maps kinds to statuses; the code travels in the RFC 9457 problem `type`.
Objects of another association use the not_found code (existence is not revealed). -->

| Code | Kind | Message to the actor | AC |
|---|---|---|---|
| `<context>.<error_name>` | invariant | <plain message> | AC-NN |

## 6. Non-functional requirements

<!-- Skill instruction: start from stack-defaults §NFR, keep the rows that apply, mark kept defaults «(default)», add feature rows. Numbers only. Unknown -> TBD with a §8 row. -->

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95, read/list | ≤ 200 ms (default) | request-duration histogram |
| Latency p95, write | ≤ 500 ms (default) | request-duration histogram |
| Throughput | ≥ 50 req/s per instance (default) | load smoke test in CI |
| Availability | 99.5 % monthly (default) | uptime check |
| Durability | RPO ≤ 24 h, RTO ≤ 4 h (default) | backup + quarterly restore drill |
| Integrity | locked records change only via a new referencing record | integrity check, 0 mismatches |

## 6.1 Security / privacy

<!-- Skill instruction: classification (one word + reason); personal data touched (fields + sensitivity: names, apartment numbers, signatures, contact data); authorization impact in role terms; 3-5 abuse cases with the business response (cross-association access, editing a signed record, leaking personal data in an export or to an AI service, uploading a forged scan, mass upload); security review Required or N/A with reason. -->

- **Data classification:** <...>
- **Personal data touched:** <...>
- **Authorization impact:** <...>
- **Abuse cases:**
  - <case>: <business response>
- **Security review:** <Required / N/A — reason>

## 7. Metrics / KPIs

<!-- Skill instruction: at least 3, baseline -> target + timeframe, from the brief's success measure and RICE drivers (time per document, corrections after signing, share of values with a source, time to find a past decision). -->

- **<metric>** — baseline: <...>, target: <... within ...>.

## 8. Open questions

<!-- Skill instruction: brief §15 items still open + step-7 Save-as-OQ. Every row has owner and due. -->

- [ ] <question>? Default now: <...>. — owner: <role>, due: <date or stage>

## 9. Migration plan

<!-- Skill instruction: business-level, no table names.
- New records the feature introduces and which existing records they link to (for example meetings already stored by the reference context).
- What happens to existing records: untouched / linked / backfilled — and who confirms a backfill.
- Reversibility: what a rollback keeps and what it loses; signed records are never deleted.
- Rollout order by stage, and what a user sees between stages.
N/A only for a feature with no stored data, with the reason. -->

## 10. RBAC and state machine

<!-- Skill instruction:
RBAC: rows = glossary roles that touch the feature, columns = actions. Cell: ✓ / ✗ / «own only» / «read only». Scope is one association; rights come from a board term in force on the date of the action.
State machine: list the states of the main document, then allowed transitions «From → To — who — condition», then refused transitions «From → To — why refused». Every line here has an AC in §5. Reference shape: stack-defaults §State machine. -->

### Roles and actions

| Role | <action 1> | <action 2> | <action 3> |
|---|---|---|---|
| <glossary role> | ✓ | ✗ | read only |

### States

- **<State>** — <one-line meaning>

### Allowed transitions

| From → To | Who | Condition | AC |
|---|---|---|---|
| <A> → <B> | <role> | <condition> | AC-NN |

### Refused transitions

| From → To | Why refused | AC |
|---|---|---|
| <Signed> → <Draft> | a signed record is immutable; corrections go through a new decision | AC-NN |
