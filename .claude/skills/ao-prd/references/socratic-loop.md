# Socratic loop - ao-prd step 7

Self-contained copy of the course loop (`sdlc` `_shared/socratic-loop.md` + the write-prd delta)
with the ao-prd additions marked **[ao]**. Question wording: [`ask-style.md`](./ask-style.md),
examples: [`ask-examples.md`](./ask-examples.md).

## Коротко

Skill показує всю секцію, потім питає по одному рішенню. На кожне: **Прийняти** / **Виправити** /
**Винести у відкрите питання** / **Викинути**; для AC ще **Додати AC** і **[ao] Додати граничний
випадок**. Усе живе в пам'яті й edits-log до кінця кроку 8; протиріччя між секціями ловить критик.

## Sections walked (in order)

§4 US -> §5 AC -> **[ao]** §5.1 error catalogue -> §6 NFR -> §7 KPI -> **[ao]** §9 migration plan ->
**[ao]** §10 RBAC and state machine. §1-§3 are shown, not walked per item; §3 also changes through
the US rule below.

## Contract per section

1. Render the whole proposed section with numbered decisions.
2. One `AskUserQuestion` per decision.
3. Apply each resolution to the in-memory draft.
4. Run the section's gate (floors below).
5. Next section. Never return to a resolved section: cross-section drift is the critic's job.

Nothing is written to disk before step 8.

## The state machine

- **Approve** - keep verbatim, no log entry.
- **Edit** - the user gives new wording once; regenerate and ask once more; the second answer is
  final. Log `edit`.
- **Save as Open Question** - move to §8 as
  `- [ ] <question>? Default now: <X>. — owner: <role>, due: <date or stage>`. Ask owner and due
  right away; without both, downgrade to Drop with a warning. Log `save_as_oq`.
- **Drop** - remove. Re-ask once if the item is mandatory for a floor. Log `drop`.

Per item type:

- **User story** - 4 states. **[ao] Scope-cut rule:** when an `Edit` narrows a US (removes an actor,
  an action, an object or a case that the old wording covered), write the removed part into §3
  Non-goals in the same step as `- <removed part> — <user's reason>; was in US-NN before edit.`,
  show the new §3 line in the next question, and log it as a second entry
  `{item_id: "NG-NN", action: "add", user_reason: "scope cut from US-NN"}`. An `Edit` that only
  rewords adds nothing.
- **Acceptance criterion** - 4 states + **Add another AC** (user dictates, skill drafts in GWT,
  one confirm question) + **[ao] Add edge case**: offer 2-4 fitting cases from
  [`stack-defaults.md`](./stack-defaults.md) §OSBB edge cases plus «свій варіант»; the skill drafts
  `AC-NNb` under the same US with the same coverage type unless the case changes it, and asks one
  confirm question. Log `add`.
- **[ao] Error code** - Approve / Edit (rename, merge with another code, change kind) / Drop (only
  if no AC needs it). A rename is re-checked against the regex.
- **NFR row** - Approve / Edit number or measurement / Save as OQ. An adjective is never approvable.
  **[ao]** Show the stack default and say in the description that it is a default.
- **KPI** - Approve / Edit / Drop; baseline TBD needs a measurement plan or an OQ.
- **[ao] Migration step** - Approve / Edit / Save as OQ.
- **[ao] RBAC cell or transition** - Approve / Edit / Drop. A new or changed transition fires the
  transition floor.

## Gates (re-checked after every resolution)

1. Coverage-type floor: each of the 7 types in [`draft-generation.md`](./draft-generation.md) has an AC.
2. Use-case floor: every retained US has an AC. Dropping the whole US is a de-scope and does not fire.
3. **[ao]** Transition floor: every allowed and every listed refused transition in §10 has an AC.
4. **[ao]** Catalogue floor: every error, invariant and authorization AC has a §5.1 code, and every
   code cites an AC.

A broken floor -> draft the missing item and run one confirm question. OQ-migrated items do not
count toward any floor.

## Edits-log

```
{item_id:     "US-06" | "AC-04" | "ERR-03" | "NFR-2" | "KPI-01" | "MIG-1" | "TR-3" | "NG-05",
 action:      "edit" | "drop" | "add" | "save_as_oq",
 before:      "<verbatim before, null for add>",
 after:       "<verbatim after, §8 row for save_as_oq, null for drop>",
 user_reason: "<the user's words>"}
```

Approve is not logged. If the user gives no reason on Drop or Save as OQ, ask once.

## Cadence

- A one-line recap every ~5 questions.
- Volume follows depth ([`interview-depth.md`](./interview-depth.md)) and size
  ([`size-matrix.md`](./size-matrix.md)); floors never do. At easy depth, the skipped reversible
  decisions go to an assumptions ledger shown for a batch veto.

## Exit

All seven sections walked, every item resolved, all four floors closed, no pending log entries.
Then step 8 ([`critic.md`](./critic.md)).
