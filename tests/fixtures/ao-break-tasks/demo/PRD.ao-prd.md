---
status: Approved
skill: ao-prd
feature_size: "S"
---

# PRD - demo

## 4. User stories

### US-01: Keep protocols  _(Stage 1)_

## 5. Acceptance criteria

### AC-01 (US-01) — happy path
**Given** a member **When** they create a draft **Then** it is stored as чернетка

### AC-02 (US-01) — domain invariant
**Given** a signed protocol **When** a member edits it **Then** the system refuses

### AC-03 (US-01) — happy path
**Given** drafts **When** a member opens the list **Then** the newest come first

### Deferred to Stage 2

#### AC-04 (US-01) — traceability  _(Stage 2: blocking checks)_
**Given** ... **When** ... **Then** ...

## 5.1 Error catalogue

| Code | Kind | Message to the actor | AC |
|---|---|---|---|
| `governance.protocol_not_found` | not_found | Протокол не знайдено. | AC-03 |
| `governance.protocol_locked` | invariant | Підписаний протокол змінити не можна. | AC-02 |

Deferred to Stage 2: `governance.quorum_missing` (AC-04).

## 6. Non-functional requirements
