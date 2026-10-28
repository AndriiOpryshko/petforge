# CONTEXT.md gate

The task DoD quotes three CONTEXT.md sections. Without them the domain, sqlc and HTTP tasks would be
written from memory, so the skill stops before slicing.

## Required sections

The five-section layout (`## Glossary`, `## Invariants`, `## Sentinel errors`,
`## Org-filter invariant`, `## Out of scope`) is the one in the course worked example
(`sdlc/examples/course-lesson-mvp/CONTEXT.md`); the `fix-term` template carries the first, second
and fifth. This skill needs:

| Section | Used by | Must contain |
|---|---|---|
| `## Invariants` | `domain` DoD (one test per invariant), `app` DoD | ≥1 line «X always must / can never» |
| `## Sentinel errors` | `domain` errors.go, `http` problem mapping, the checker's code list | the `<context>.<error_name>` codes, one per line |
| `## Org-filter invariant` | every `sqlc` DoD, `migration` DoD | the column (`association_id`), the rule (every query filters), the miss behaviour (`*_not_found`), the ADR id |

Check: `grep -n '^## \(Invariants\|Sentinel errors\|Org-filter invariant\)' docs/features/<slug>/CONTEXT.md`.
A section that exists but holds only a template placeholder counts as missing. `CONTEXT.md` itself
missing -> stop: «run `/sdlc:fix-term <slug>` first».

## When a section is missing

One `AskUserQuestion` (ask-style; say which sections are missing and that the DoD depends on them):

1. **Draft them from upstream (Recommended)** - the skill drafts the missing sections only from
   sources, shows them in full, and writes them into `CONTEXT.md` after the user approves, as a
   separate commit `docs(<slug>): CONTEXT invariants, sentinels and org filter`:
   - Invariants <- PRD §10 refused transitions + "domain invariant" ACs + data model invariants
     (one line each, domain words only - no table or framework names, per the CONTEXT rule);
   - Sentinel errors <- PRD §5.1 table rows (Stage 1), codes verbatim, grouped by context;
   - Org-filter invariant <- the org-filter ADR (column, «every query filters», cross-association
     id answers `*_not_found`, the ADR id) + PRD §6.1.
2. **Stop, I will fix CONTEXT.md** - end the run with the handoff pointing to `/sdlc:fix-term <slug>`
   and a list of the missing sections.

Never write CONTEXT.md without the approval; never invent a code that is not in §5.1 or the
existing CONTEXT.

## Reconciling the sources

- A code in CONTEXT "Sentinel errors" but not in PRD §5.1 (or the reverse) -> list it in `_epic.md`
  Notes and ask whether it is Stage 1; the checker uses the union passed to it.
- An invariant that contradicts PRD §10 -> stop and ask; it is a PRD / CONTEXT drift, not a task.
