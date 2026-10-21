---
description: Add a whole vertical slice (entity in a new bounded context) in one go - plan, scaffold, test, ship
argument-hint: <Entity> in context <context>: <fields and rules in plain words>
---

Build the vertical slice described below with the petforge workflow, in order, without stopping
between steps unless one fails:

1. `slice-plan` with this description: $ARGUMENTS
2. `slice-scaffold` with the spec it wrote
3. `slice-tests`
4. `slice-ship`

Finish with the slice-ship report.
