---
name: ao-discovery
description: >
  Standalone discovery interview for features in small self-governed organisations
  (housing associations / OSBB, community boards) built as Go + React modular monoliths.
  Same 14-phase flow as the course sdlc:interview - Socratic interview, status-quo research,
  3 strategic approaches, multi-perspective review, devil's advocate, Claude-proposed RICE and
  Feasibility - with questions for non-engineering board members, a legal-competence check,
  a source-of-truth map (which document owns every number) and an AI / deterministic boundary.
  Writes docs/features/<slug>/idea-brief.md (18 sections, <=6 pages). Triggers on
  "/ao-discovery <slug>", "discovery for <slug>", "brief for <feature> in OSBB",
  "інтерв'ю фічі ОСББ", "бриф для правління", "discovery-бриф".
---

# ao-discovery

Discovery interview for one feature. Parallel to `sdlc:interview`, not a replacement: it
keeps the same phases and gates, and changes the questions, the reference material and three
steps that do not fit a single-association product (see "What differs from sdlc:interview").

## Audience

The people answering are board members of a housing association: the chair (signs and
answers for documents), the accountant, the auditor (ревізор), sometimes a resident.
They are not engineers and they think in documents, meetings and legal responsibility,
not in screens and endpoints.

Consequences for every question:

- Ukrainian, plain words, no product or engineering jargon. A term like RICE stays as a
  name, but every option explains what it means in one sentence.
- Ask about documents and decisions, not about features: "Який документ ви зараз
  підписуєте?" beats "Яку функцію ви хочете?".
- Every option description says what changes in the brief and what the hidden consequence
  is (for example "позначити TBD" blocks `write-prd` until it is resolved).

## When to use

- A new feature for an OSBB-style product, or any product where the user's real job is to
  produce or approve a legally meaningful document.
- `/ao-discovery <slug>` as explicit invocation.
- Not for pure engineering refactors - use `sdlc:interview` or no brief at all.

## Inputs

- `<slug>` - kebab-case, short. If missing, suggest 2-3 from the idea.
- Optional: sample documents (a real protocol, contract, invoice) - the source-of-truth map
  in phase 2b is built from them, not from memory.

## Output and collision rule

- `docs/features/<slug>/idea-brief.md` from `./templates/idea-brief.md`, frontmatter
  `skill: ao-discovery`.
- If `idea-brief.md` already exists and its frontmatter `skill:` is not `ao-discovery`
  (for example a brief written by `sdlc:interview`), never overwrite it: write
  `docs/features/<slug>/idea-brief.ao-discovery.md` next to it and say so. This is how the
  two skills are compared on one feature.

## Depth regulator (first checkpoint)

Same as `sdlc:interview`: easy (3-4 checkpoints, no sub-agents), medium (default, full
protocol), hard (extra Socratic batch, wider status-quo research). Recorded in `depth:`.
Easy still asks real questions; it never fabricates answers.

## Mode handling

Phases 0-11 are read-only (Read, Grep, WebSearch, Agent, AskUserQuestion). All writes happen
in phase 12. In plan mode, call `ExitPlanMode` between phases 11 and 12; otherwise go straight
on. Auto Mode does not cancel the AskUserQuestion checkpoints of phases 1, 2, 2b, 9, 10, 11:
they are the data the brief is made of. If a question is denied, stop and say so.

## Protocol

### 0. Setup (read-only)

- Read `./templates/idea-brief.md` and `./references/osbb-domain.md`.
- Read `CONTEXT.md` (repo root and `docs/features/<slug>/`) into session state.
- Check the collision rule above.

### 0.25. Depth checkpoint (AskUserQuestion)

### 1. Idea capture (AskUserQuestion)

"Опиши ідею в 1-3 реченнях так, як розповів би сусідові по правлінню." Keep it verbatim as §1.

### 2. Socratic deep dive (AskUserQuestion, batches of 2-3)

Pick 4-6 questions, at least one per block. Question bank: `references/osbb-domain.md`
§Socratic questions.

- **Document and decision** - which document comes out, who signs it, who reads it later
  (residents, auditor, bank, court).
- **Today's workaround** - how it is done now (Word template, Viber group, Excel, the
  accountant), how long it takes, how often.
- **Cost of a mistake** - what happens if a number or a wording is wrong: re-vote, fine,
  conflict with residents, invalid decision.
- **Competence** - is this a board decision or only a general-meeting decision; what the
  charter (статут) limits.
- **Success** - one measurable outcome (time per document, number of corrections, disputes).

### 2b. Source-of-truth map (AskUserQuestion) - new step

For every number, date, name or requisite that will appear in the output, ask where it comes
from: registry / the association's own data, a document of the case (contract, invoice,
commercial offer), the charter or a meeting decision, or human judgement. Build the
§16 table. Rule from the product practice: anything with a deterministic source is rendered
from data and never written by AI; AI only writes wording and warnings with a link to the
source.

Ask once, for every check that surfaces here (limit, quorum, competence, missing source,
unconfirmed amount), whether it **blocks printing** or is **advisory**. A blocking check must be
computed from data; an AI-written warning is always advisory. Record the tier in the Warnings
row of §16 and use the same word everywhere in §7 and §9.

### 3. Glossary capture (deferred)

Collect new domain words into `pending_glossary_terms`. Typical OSBB homonyms are listed in
`references/osbb-domain.md` §Glossary seeds (протокол правління vs протокол загальних зборів,
кошторис vs рахунок, співвласник vs мешканець). Applied in phase 12, never in planning.

### 4. Status quo and alternatives (Claude-driven) - reworked step

`sdlc:interview` looks for 3-5 market competitors. For a single association the honest
comparison is with today's workaround, so §6 has two parts:

- **Status quo** (always): the current way from phase 2, its cost (time, errors, disputes).
- **Alternatives** (only real ones): tools found by WebSearch with a URL and a date, or
  `N/A - no direct alternative found, query: <query>`. Never invent a product.

### 5. Strategic approaches (3 sub-agents in parallel)

Same three personas as `sdlc:interview` (Simplicity / Differentiation / Balanced), seeded with
the typical alternatives for this market from `references/osbb-domain.md` §Approach seeds.
Each returns Name, Thesis (product language), For whom, Outcome metric, Key trade-off, Effort
S/M/L, and **where the AI boundary sits** (what AI writes, what is rendered from data).
Use `sdd:strategist` when installed, otherwise `general-purpose` with the same prompt.

### 6. Multi-perspective review (3 sub-agents in parallel) - reworked step

The generic Engineer / Executive / UX trio misses the person who is legally exposed. Here:

- **Engineer** - complexity, integration surface, failure modes; no library or DB names.
- **Board chair** - legal responsibility, time saved, what they would refuse to sign.
- **Resident / auditor** - can a non-member understand and check the result, is the trail
  from number to source visible.

Build the §8 synthesis matrix (3 x 3, +/0/-, 6-word justification per cell).

### 7. Trade-offs and edge cases

Pros/cons per approach and 5-8 edge cases. Always cover: missing source document, two
documents disagree on a number, quorum not reached, decision outside board competence,
correction after signing.

### 8. Devil's advocate (1 sub-agent, clean context)

"How does this fail in a real association?" - 5-10 attack vectors with the signal that would
show it (a resident complaint, an auditor remark, a bank refusing a document). Top vector goes
to §10. Use `sdd:devils-advocate` when installed.

### 9. RICE (AskUserQuestion) - reworked step

Reach in a single association is tiny and makes every RICE look bad, so count **documents or
decisions per year across the associations you serve**, not people. Impact must reflect the
cost of a mistake from phase 2 (a legal-risk feature gets Impact >= 2). Confidence drops to 0.5
when §16 has rows with source "unknown" or when Reach counts associations that are not yet
confirmed users (then list Reach in §15 too). Effort from §7. User confirms or adjusts each
number.

### 10. Feasibility (repo scan + AskUserQuestion)

Scan the repo read-only for adjacent modules and patterns: bounded-context folders, document
rendering, file upload, existing sentinel errors (`references/osbb-domain.md` §Repo reference).
Cite what you found; "we know how" without a path is a guess. Time is ☑ only with a named
person and a window (for example "author, evenings, Nov-Dec"); a bare "confirmed" stays ☐.

### 11. Recommendation (AskUserQuestion)

Pick one approach. The rationale cites §6 (status-quo cost or an alternative's gap), §8 (one
cell, preferably the board-chair column), §11 (RICE), §12 (Feasibility) and §16 (how many
values are deterministic vs AI-written).

### 12. Write the brief

Create the folder, copy the template, apply pending glossary terms (`sdlc:fix-term` or
`sdd:glossary` if installed; otherwise list them in §15), fill all 18 sections, set
`status: Confirmed`, `value_score`, `feasibility_state: confirmed`, `updated_at`.

### 13. Self-check

- 18 sections present, none empty (`<!-- TBD -->` allowed where honestly unknown).
- No tech terms in the body: `\b(Postgres|PostgreSQL|Redis|Kafka|MySQL|pgx|sqlc|gorm|chi|React|Vite|JSONB|REST|endpoint)\b`
  and `p99`, outside §17 (§17 is the only place for repo identifiers).
- Every row of §16 has a source and an owner; no AI-written row contains a number.
- Each check has one tier: a check called non-blocking in §7 is not "blocks printing" in §9.
- Length <= 6 pages (~2600 words).
- §13 cites §6, §8, §11, §12, §16.

### 14. Propose commit and next owner

`01: idea for <slug> via ao-discovery`. Next: chair + tech lead -> `sdlc:write-prd <slug>` (or
`sdd:specify <slug>`).

## What differs from sdlc:interview

| Step | sdlc:interview | ao-discovery |
|------|----------------|--------------|
| 2 Socratic | generic product blocks | document, workaround, cost of mistake, competence, success |
| 2b | - | source-of-truth map for every number and requisite |
| 4 Research | 3-5 market competitors | status quo first, real alternatives only |
| 6 Personas | Engineer / Executive / UX | Engineer / Board chair / Resident-auditor |
| 9 RICE | Reach in users | Reach in documents per year, Impact from cost of mistake |
| Template | 15 sections | + §16 source of truth, §17 repo reference, §18 legal check |

## Definition of Done

- Brief written at the path from the collision rule, 18 sections, frontmatter confirmed.
- AskUserQuestion checkpoints of phases 1, 2, 2b, 9, 10, 11 actually fired.
- §16 covers every value that will appear in the output document.
- Self-check passed; commit proposed.

## Anti-patterns

- Letting AI write a number, a date or a requisite that has a deterministic source.
- Inventing a competitor because the table looks empty - a niche local market often has none.
- Asking a board member about "features" or "screens" instead of documents and decisions.
- Skipping the competence question: a perfect protocol of a decision the board may not take
  is worse than no protocol.
- Overwriting a brief written by another skill.
