# Draft generation - per-section contract for ao-prd step 6

The authoritative format for each section is the `<!-- Skill instruction -->` comment in
[`../templates/PRD-template.md`](../templates/PRD-template.md). This file says where content comes
from and what is forbidden. Defaults to propose: [`stack-defaults.md`](./stack-defaults.md).

## Inputs in priority order

1. `CONTEXT.md` `## Glossary` - canonical roles and terms. It wins over everything else.
2. The idea brief. From an ao-discovery brief: §2 Problem, §3 Users, §5 Out of scope, §9 Trade-offs
   and edge cases, §13 Recommendation, §15 Open questions, §16 Source of truth, §17 Repo reference,
   §18 Legal and competence check.
3. Reference context code (step 5) - entity names, sentinels, status constants, authorization
   checks. Feeds §5.1, §9, §10 and §1 ¶4 traceability only.
4. `docs/adr/` and `docs/architecture-map.md` - constraints for §1 ¶4, §3 and §9.

## Per-section sources

- **§1 Context** - ¶1 problem and who has it (brief §2, §3). ¶2 why now. ¶3 committed approach
  (brief §13), including where the AI boundary sits. ¶4 traceability: reference paths read, ADRs
  that constrain the feature, deviations from the brief with reasons, critic overrides.
- **§2 Goals** - 2-3 outcomes, no numbers.
- **§3 Non-goals** - brief §5 Out of scope, each with a reason, plus every scope cut made by a US
  `Edit` in step 7 (see [`socratic-loop.md`](./socratic-loop.md)).
- **§4 User stories** - As a / I want / So that, roles from the glossary. At least one US per role
  that acts in the feature and per §2 goal. Tag each US with its delivery stage when the brief
  phases the feature.
- **§5 Acceptance criteria** - contract below.
- **§5.1 Error catalogue** - one row per distinct failure the AC describe.
- **§6 NFR** - start from the stack-defaults table, drop rows that do not apply with a reason,
  add feature-specific rows. Numbers only.
- **§6.1 Security / privacy** - classification, personal data, 3-5 abuse cases with the business
  response.
- **§7 KPIs** - from the brief's success measure and RICE drivers, baseline -> target + timeframe.
- **§8 Open questions** - brief §15 items still open + step-7 `save_as_oq`, each with owner and due.
- **§9 Migration plan** - new or changed data, what happens to existing records (for example
  meetings already in `governance`), backfill, reversibility, rollout order.
- **§10 RBAC and state machine** - role x action matrix from the glossary roles, then the states,
  allowed transitions with the role allowed to make each, and refused transitions.

## §5 acceptance-criteria contract

Given / When / Then, business-observable, from the actor's view. No upper cap. Seven coverage
types, at least one each:

1. **happy** - main flow, the system records the outcome and confirms.
2. **error** - invalid input is refused with the reason in plain words.
3. **authorization** - a role without the right, or someone from another association, is refused
   or does not see the object.
4. **domain invariant** - a named rule is broken; the system blocks and names the rule.
5. **cross-context** - the action depends on another bounded context; the rule is enforced.
6. **traceability** - every number, date or requisite in the output shows its source from §16
   (case document, registry, charter, a person's confirmation); a value without a source is
   flagged or blocks, as §16 says. One AC per value class at least (amount, date, person).
7. **legal competence** - a decision outside the body's powers (brief §18: general-meeting only,
   charter limit, term expired) is refused or flagged as the brief decided.

Floors (draft time and after every Socratic resolution):

- each of the 7 types has an AC;
- every retained §4 US has an AC;
- every §10 allowed transition has an AC, and every refused transition listed in §10 has an AC;
- every error, invariant and authorization AC has a §5.1 code that cites it.

Concurrent or boundary cases are added as `AC-NNb` under the same US.

## Forbidden tokens in §5 AC (zero tolerance)

The scan covers only the AC blocks between `## 5.` and `## 5.1`:

- HTTP verbs `GET`, `POST`, `PUT`, `PATCH`, `DELETE`;
- URL paths: `/` followed by a lowercase identifier;
- status numbers as standalone tokens `200|201|204|400|401|403|404|409|422|500|503` (a money
  amount such as «184 500 грн» is not a status; write amounts with a currency);
- error-code strings `[a-z_]+\.[a-z_]+` - they belong to §5.1;
- JSON fragments, SQL and table or constraint names, driver error types;
- technology names (Postgres, Go, React, chi, sqlc, pgx) - also forbidden in §1-§3.

## §5.1 error-catalogue contract

- Code format and kinds from [`stack-defaults.md`](./stack-defaults.md) §Error codes.
- Columns: code, kind, plain-language message the actor sees (Ukrainian), AC that produce it.
- Context must be an existing folder under `services/*/internal/` or marked `planned`.
- One code per rule, not per AC: two AC that break the same rule share a code.
- No status numbers here either; `api-forge` maps kinds to statuses.

## Pre-write hygiene

- §4 and §10 roles are glossary terms verbatim.
- §3 has a reason on every line and contains every scope cut from the edits-log.
- §1 ¶3 matches brief §13.
- §5 floors hold; forbidden-token scan is clean; every §5.1 code matches the regex.
