---
status: Draft | Confirmed | Frozen
skill: ao-discovery
owner: "<board chair or idea author>"
reviewers: []
updated_at: "<YYYY-MM-DD>"
feature_size: <XS|S|M|L|XL>     # set by classify-size, not here
stage: "01"
depth: easy | medium | hard
ticket: "<ticket-id>"
value_score:
  rice: <number>
  state: proposed | confirmed
  confirmed_at: "<YYYY-MM-DD>"
feasibility_state: proposed | confirmed
---

<!-- Why: capture the idea in the language of the board before it is retold as a feature list. -->
<!-- Self-check: no tech terms outside §17; no number in an AI-written row of §16. -->

# Idea Brief — <feature name>

## 1. Raw idea
<verbatim from phase 1>

## 2. Problem
<1-3 sentences with facts: time per document, frequency, mistakes seen>

## 3. Users
<who signs, who prepares, who reads later (residents, auditor, bank); how often>

## 4. Why now
<trigger: a disputed decision, an audit remark, a new charter rule, a deadline>

## 5. Out of scope
- <bullet>

## 6. Status quo and alternatives

### Status quo
<how it is done today, cost in time / errors / disputes>

### Alternatives
| # | Product · URL | Features | Value per feature (1-5) | Gap |
|---|---|---|---|---|
| 1 | <name> · <url> | <features> | <ratings> | <gap> |

<or: N/A - no direct alternative found, query: "<query>", <date>>

## 7. Strategic approaches

### Approach A — <3-5 word name>
- **Thesis**:
- **For whom**:
- **Outcome metric** (baseline -> target):
- **Key trade-off**:
- **AI boundary** (what AI writes / what is rendered from data):
- **Effort signal**: S / M / L
- **Recommended?** ◯ / ●

### Approach B — <name>
<same structure>

### Approach C — <name>
<same structure>

## 8. Multi-perspective feedback

### Engineer
- <3-5 bullets, no library or DB names>

### Board chair
- <3-5 bullets: legal exposure, time, what they would refuse to sign>

### Resident / auditor
- <3-5 bullets: can they understand and check it, is the trail to the source visible>

### Synthesis matrix
|        | Engineer | Board chair | Resident / auditor |
|--------|:--------:|:-----------:|:------------------:|
| App. A | <+/0/- and 6 words> | | |
| App. B | | | |
| App. C | | | |

## 9. Trade-offs and edge cases

### Trade-offs per approach
| Approach | Pros | Cons |
|---|---|---|
| A | | |
| B | | |
| C | | |

### Edge cases
- Missing source document
- Two documents disagree on a number
- Quorum not reached
- Decision outside board competence
- Correction after signing
- <more>

## 10. Risks
- <top devil's-advocate vector + the signal that shows it>

## 11. RICE — Claude proposed
- **Reach (R)**: <documents or decisions per year> — from §3
- **Impact (I)**: <0.25 | 0.5 | 1 | 2 | 3> — from cost of a mistake (§2) and the board-chair view (§8)
- **Confidence (C)**: <0.5 | 0.7 | 0.8 | 1.0> — 0.5 if §16 has "unknown" sources
- **Effort (E)**: <person-weeks> — from §7
- **RICE = R × I × C / E = <number>**
- **State**: proposed | confirmed

## 12. Feasibility — Claude proposed
- [☑/☐] **Tech**: <cite adjacent module from the repo scan, or "no adjacent module in repo">
- [☑/☐] **Skills**:
- [☑/☐] **Time**:
- **State**: proposed | confirmed

## 13. Recommendation
**Selected: Approach <X>** — <3-5 sentences citing §6, §8, §11, §12, §16>

**Locked-in pointer**: <what this commits the spec to>

## 14. Parked & rejected approaches
| # | Approach | Status | Reason | Revisit trigger |
|---|---|:---:|---|---|
| | | parked | | |

## 15. Open questions
- [ ] <question> — owner: <name>, due: <date>

## 16. Source of truth
<!-- One row per value that appears in the output document. -->
| Value in the document | Source | Written by | Who may change it |
|---|---|---|---|
| <e.g. contract amount> | <case document: contract> | data | <nobody; re-import> |
| <e.g. wording of the decision> | <facts above> | AI | <chair> |

## 17. Repo reference
<!-- The only section where repo identifiers are allowed. -->
- **Bounded context**: <existing or new context name>
- **Adjacent modules**: <paths found in phase 10, or "none yet">
- **Sentinel error seeds**: <`context.snake_case` list from §9 edge cases>

## 18. Legal and competence check
- **Who decides**: board / general meeting — <why>
- **Charter limits**: <amount limit, source of funds, quorum> — source: <charter clause or "TBD">
- **Meeting decisions that apply**: <list or "none">
- **What happens if this is wrong**: <re-vote, invalid decision, dispute>

## Related
- CONTEXT.md, ticket, related features

## DoD self-check
- [ ] 18 sections present
- [ ] No tech terms outside §17
- [ ] Every §16 row has a source and an owner; no AI row holds a number
- [ ] Length ≤ 6 pages (~2600 words)
- [ ] status: Confirmed, RICE and Feasibility confirmed
- [ ] §13 cites §6, §8, §11, §12, §16
