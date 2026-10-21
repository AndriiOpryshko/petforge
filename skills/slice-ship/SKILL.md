---
name: slice-ship
description: Final gate for a petforge slice - run the project's full lint and test commands, fix what fails, and write the PR description. Last step of the petforge workflow. Use when asked to "ship the slice", "run the gate", "is the slice ready", "/petforge:slice-ship".
---

# slice-ship

## Steps

1. Commands from `.claude/petforge.json` (`lint`, `test`) or `mise run lint` and `mise run test`.
   Run them in one Bash call: `<lint> && <test>`.
2. On failure, fix the cause in hand-written code and rerun the failing command, then both.
   Do not edit generated files and do not disable lint rules.
3. Commit and push only if the user asked for it in this conversation.
4. Report, ready to paste as a PR description:
   - what the slice adds (endpoints, table, context);
   - tests run and their result;
   - `Created with petforge: /petforge:slice-plan, /petforge:slice-scaffold, /petforge:slice-tests, /petforge:slice-ship`;
   - anything you had to write by hand that petforge did not generate.
