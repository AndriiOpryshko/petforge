# ao-prd - Definition of Done

Run at the end of step 8, after the critic resolution.

- [ ] PRD written at the collision-rule path; frontmatter `skill: ao-prd`, `status: Draft`,
      `feature_size` from `.size`, `updated_at` today.
- [ ] `.size` exists.
- [ ] Sections §1-§10, §5.1 and §6.1 filled or `<!-- N/A: reason -->`.
- [ ] §1 ¶4 lists the reference paths and ADRs read, every deviation from the brief and every
      critic override.
- [ ] §3: at least 3 lines, each with a reason, including every scope cut from a US `Edit`.
- [ ] §4: at least one US per acting glossary role and per §2 goal; roles verbatim from the glossary.
- [ ] §5: every AC in Given/When/Then; the 7 coverage types present after drops and OQ moves.
- [ ] §5: every retained US has an AC; every §10 allowed and listed refused transition has an AC.
- [ ] §5: at least one AC added through «Add edge case», or the edits-log shows it was offered.
- [ ] §5: forbidden-token scan clean (or each hit overridden with a reason).
- [ ] §5.1: every code matches `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`, names an existing or
      `planned` context and cites an AC; every error / invariant / authz AC has a code.
- [ ] §6: every row numeric with a measurement; defaults that were kept are marked as defaults.
- [ ] §6.1: 3-5 abuse cases with the business response.
- [ ] §7: at least 3 KPIs, baseline -> target + timeframe.
- [ ] §8: every row has owner and due.
- [ ] §9: covers existing records, backfill, reversibility and rollout order, or N/A with reason.
- [ ] §10: RBAC matrix with glossary roles only; state list; allowed transitions with the role;
      refused transitions.
- [ ] New domain terms are in `CONTEXT.md` `## Glossary`.
- [ ] Edits-log complete; critic ran on the final draft; every finding resolved.
- [ ] Commit proposed: `02: PRD for <slug> via ao-prd`. `status: Approved` left to the human.
