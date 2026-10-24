---
status: accepted                 # proposed | accepted | superseded by NNNN. ao-architecture writes accepted (decided with the user now).
date: <YYYY-MM-DD>
feature: <slug>
sad_section: "§<N>"
deciders: ["<architect>", "<user in the Socratic walk>"]
---

# NNNN <decision as a sentence: "Store signed scans outside Postgres">

<!-- Spawned by ao-architecture when a decision scores 2 of 4 (or data + irreversible) on the
     blast-radius gate → references/blast-radius-heuristic.md.
     Same shape as the repo ADRs in docs/adr/: frontmatter status/date, title "NNNN <decision>".
     File: NNNN-<decision-in-kebab-case>.md — decision form, not problem form:
       ✓ 0003-store-signed-scan-outside-postgres.md   ✗ 0003-scan-storage.md -->

## Context and problem statement

<2-4 sentences: what forces the decision now. Cite the PRD (US / AC id) and the SAD section that
raised it. Name the repo ADR that frames it if any (e.g. "ADR 0002 keeps contexts independent").>

## Decision drivers

<!-- Each bullet traces to PRD §6 NFR, PRD §5.1 / §9 / §10 (ao-prd PRD), SAD §2 Constraints or a
     §1 quality goal. No pet preferences. -->

- <e.g. PRD §6: signed records kept ≥ 5 years, never hard-deleted>
- <e.g. SAD §2: one Postgres per process (repo ADR 0001)>

## Blast radius

- Irreversible: <yes/no — why>
- Multi-context: <yes/no — which contexts or web + core>
- Legitimate alternative: <yes/no — which>
- Touches the database: <yes/no — table / migration / backfill / retention>

## Considered options

<!-- Every option shown in the AskUserQuestion, including rejected ones. No strawmen: an option
     excluded by docs/adr/0001-0004 or CLAUDE.md does not belong here (critic F6). -->

1. **<Option A>** — <one sentence>.
2. **<Option B>** — <one sentence>.

## Decision outcome

**Chosen:** <option>. <1-2 sentences why, against the drivers.>

### Consequences

- Good: <...>
- Bad: <...>
- Neutral: <...>

### Migration and rollback

<!-- Required when "Touches the database" is yes; otherwise "N/A — no stored data changes". -->

- Migration: <goose migration(s), what existing rows get, backfill owner>
- Rollback: <what a down migration keeps and loses; signed records are never deleted>

## Links

<!-- Three links, all mandatory (critic F7). -->

- PRD: [PRD.md](../PRD.md) — <US-NN / AC-NN that triggered it>
- SAD: [sad.md](../sad.md) §<N>
- Related ADR: [NNNN-<other>](./NNNN-<other>.md) <or repo ADR: [0002 Bounded contexts](../../../adr/0002-bounded-contexts.md)>
