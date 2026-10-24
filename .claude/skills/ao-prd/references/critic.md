# Critic - ao-prd step 8

Self-contained: the course critic (`sdlc` `agents/critic.md` + `_shared/critic.md` + the write-prd
delta) with ao-prd's F5, F6 and the new F7. Works without the sdlc plugin.

## Dispatch

One `Agent` call, `subagent_type: "general-purpose"` (use `sdlc:critic` if it is installed - same
prompt), clean context. Inline the full post-Socratic draft and the edits-log; pass upstream files
as paths only, the critic reads them itself. Fill the placeholders in the prompt below.

## Prompt (everything below the line)

---

You are a clean-context critic for a **Product Requirements Document of a housing-association
(OSBB) feature: context, goals, non-goals, user stories, acceptance criteria, error catalogue,
NFR, KPI, open questions, migration plan, RBAC and state machine**. You did not see the
conversation that produced it. Find cross-section drift, damage from user edits, structural gaps
and leaks. Do not propose new scope: coherence, not vision. Tools: Read, Grep, Glob only.

### Inputs

Draft:
```
{{DRAFT}}
```

Edits-log (Approve is absent on purpose; it is the baseline):
```
{{EDITS_LOG}}
```

Read these yourself before judging:
{{UPSTREAM_FILES}}
(the feature's `CONTEXT.md`, the idea brief, the reference context path, `docs/adr/` if named)

### Failure classes

- **F1 Approach drift** - the draft contradicts the brief's §13 Recommendation or its AI boundary
  (what AI may write vs what is rendered from data).
- **F2 Size creep** - edits or adds pushed the feature past its `.size` class.
- **F3 Defer vs upstream** - a dropped or deferred item that the brief named critical (§9 edge
  cases, §10 risks, §16 sources, §18 legal check). Say whether it was dropped or deferred.
- **F4 Silent edits** - draft text that matches neither `before` nor `after` of a logged edit.
- **F5 Structure** - after drops and OQ moves: every section filled or `<!-- N/A: reason -->`;
  7 AC coverage types present; an AC per retained US; NFR rows numeric; §8 rows with owner and due;
  every US scope cut in the log has a §3 line.
- **F6 Leaks** - in §5 AC: HTTP verbs, URL paths, standalone status numbers, `x.y` error-code
  strings, JSON, SQL or table names, technology names; in §1-§3: technology names. List every hit.
- **F7 OSBB rules** -
  - a number, date or requisite in an AC that §16 sources from data but the AC lets the system or
    AI produce on its own;
  - a decision the brief's §18 puts outside the body's competence with no refusing AC;
  - a §10 transition (allowed or refused) with no AC, or an AC that moves a state §10 does not have;
  - a §10 role or a §4 role not in the glossary; an authorization AC that contradicts the §10 matrix;
  - a §5.1 code that cites no AC, an error / invariant / authz AC with no code, a code not matching
    `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`, or a context that is neither in the repo nor marked
    planned;
  - §9 that ignores existing records the reference context already stores.

### Output

At most 7 findings, priority F4 > F1 > F7 > F3 > F2 > F6 > F5; for F5, F6, F7 list every hit even
past 7. One bullet each:

`- **[F{n}] headline** — caused by: <log entry or draft line>; contradicts: <draft §> + <upstream § or glossary line>; suggested: <action>.`

Every finding cites a draft location and an upstream location, or it is dropped. Re-read the cited
lines before asserting. No preamble. If coherent: `NO_CONTESTED_DECISIONS`. If an upstream file
cannot be read: `CRITIC_BLOCKED: <reason>`.

---

## Resolution

For each finding, one `AskUserQuestion` (at most 2 batches of 4):

- **Accept as suggested** - apply the critic's action.
- **Accept, other wording** - the user types it.
- **Override** - keep the draft; add to §1 ¶4: `- Decision override: <headline> — rationale: <reason>`.

The second answer per finding is final. Then re-run the DoD in [`checklist.md`](./checklist.md).

## Scans before writing

Independent of the critic:

1. Forbidden tokens over the §5 AC blocks only (between `## 5.` and `## 5.1`), per
   [`draft-generation.md`](./draft-generation.md). A money amount with a currency is not a hit.
2. Every §5.1 code against `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`.
3. Every role word in §4 and §10 against the glossary.

A hit not overridden in the resolution re-opens one `AskUserQuestion` for that line.

## Failure modes

- Timeout or error -> stop and report; never write silently.
- `CRITIC_BLOCKED` -> stop and report.
- Malformed output -> re-dispatch once with «Your previous output did not match the required
  format»; still malformed -> ask the user.
