---
status: Living
---

# Domain Context — demo

## Glossary

- чернетка — the editable state of a protocol. NOT a print copy.

## Invariants

- A signed protocol can never change.

## Sentinel errors

- governance.protocol_not_found
- governance.protocol_locked
- identity.session_required

## Org-filter invariant

- Every query filters by association_id (ADR 0016); another association's id answers governance.protocol_not_found.

## Out of scope

- Several associations.
