---
name: ao-sdlc-audit
description: Inspection skill - audits one feature folder and reports which of the 9 SDLC artifacts (idea-brief, PRD, sad, adr/, data-model, openapi.yaml, api-sync-report, tasks/, CONTEXT) are present, missing, stale or incomplete, plus gate inconsistencies, then gives 3-5 recommendations on the most critical gaps. Read-only. Use when asked to "audit {slug}", "sdlc audit", "which artifacts are missing for {slug}", "artifact map for {slug}", "is the documentation stale", "/ao-sdlc-audit {slug}", "аудит фічі {slug}", "яких артефактів не вистачає", "мапа артефактів".
---

# ao-sdlc-audit

Inspection skill, not a workflow skill. It never creates or edits artifacts - it scans,
reports a status table, and recommends which prior skill to run. Fixing is a separate step
the user starts explicitly.

## Inputs

- `slug` (required) - feature folder name.
- Features root - default `docs/features/`. Override with a path argument
  (`/ao-sdlc-audit path/to/feature-dir`) for projects that keep artifacts elsewhere.
- Code paths for code-staleness (optional), resolved in this order:
  1. `--code <artifact>=<path>` arguments (`artifact` = `data-model | openapi | tasks | any`);
  2. `<feature-dir>/.audit-paths`, one `<artifact>: <path>` per line, e.g.
     ```
     data-model: migrations/
     openapi: internal/http/
     tasks: internal/modules/billing/
     ```
  3. `files_hint` entries of `tasks/tasks.json` (migrations/`*.sql` -> data-model;
     handler/http/api/route/controller -> openapi; everything -> tasks).
- Artifacts kept outside the repo (optional): `<feature-dir>/.audit-external`, one
  `<artifact>: <where>` per line, e.g.
  ```
  sad: Confluence HLD page (partial)
  adr/: Confluence HLD, decisions section
  ```
  Such rows are reported as EXTERNAL, not MISSING. Without this file a Confluence-only HLD
  looks exactly like "no architecture at all".

## Layouts

The script detects which plugin produced the feature folder and audits it accordingly.

| Layout | Detected by | Idea + requirements | tasks.json | Next-skill commands |
|--------|-------------|---------------------|------------|---------------------|
| sdlc | `PRD.md` present | `idea-brief.md` + `PRD.md` | `tasks/tasks.json` | `/sdlc:<skill>` |
| sdd | `spec.md` present, no `PRD.md` | `spec.md` (idea in §1, requirements in §4-§6); `interview` writes no file | `tasks.json` at feature root | `/sdd:<skill>` |

In the sdd layout the idea-brief row is N/A (merged into `spec.md`) and the PRD row checks
`spec.md`. Do not report a missing `idea-brief.md` / `PRD.md` as a gap there.

## The 9 artifacts

Expected paths are relative to `docs/features/<slug>/`. "Upstream" is what the artifact is
derived from; if upstream is newer, the artifact is suspected stale.

| # | Artifact | Expected path | Phase | Contract (from -> to) | Upstream | Code it must track |
|---|----------|---------------|-------|------------------------|----------|--------------------|
| 1 | idea-brief | `idea-brief.md` (status: Confirmed); sdd: N/A, `spec.md` §1 | 1 Idea | PM -> BA/PO: problem, users, why now, chosen approach | - | - |
| 2 | PRD | `PRD.md`; sdd: `spec.md` | 2 PRD | PO/BA -> architect, QA: goals, non-goals, user stories, ACs, NFRs | idea-brief | - |
| 3 | sad | `sad.md` | 3 Architecture | architect -> tech lead, devs: Arc42 + C4, building blocks, sequences | PRD | - |
| 4 | adr/ | `adr/NNNN-*.md` (status: Accepted) | 3 Architecture | architect -> future maintainers: why this option, consequences | - | - |
| 5 | data-model | `data-model.md` (+ staged `migrations/`) | 4 Contracts | architect/backend -> backend devs, api: aggregates, DDL, indexes | sad, PRD/spec | migrations / schema |
| 6 | openapi.yaml | `contracts/openapi.yaml` | 4 Contracts | backend -> frontend, QA, consumers: request/response, error codes | data-model | handlers / routes |
| 7 | api-sync-report | `contracts/api-sync-report.md` | 4 Contracts | api skill -> reviewer: proof that contract == data-model == sequences | openapi, data-model | - |
| 8 | tasks/ | `tasks/tracker.md` + `tasks/tasks.json` (sdd: `tasks.json` at feature root) | 5 Code | tech lead -> implementers: atomic tasks, DAG, DoD, status | sad, openapi | all hinted code |
| 9 | CONTEXT | `CONTEXT.md` (feature) or repo-root `CONTEXT.md` | cross-cutting | domain experts <-> team <-> AI agents: one meaning per term | PRD, sad (soft) | - |

Size matters (`.size` file or `feature_size:` in PRD frontmatter): for XS/S without a DB
change, a missing data-model / api-sync-report is acceptable (see `mvp-vs-full.md`). For
M+ every row is expected.

## Status criteria

| Status | Rule |
|--------|------|
| PRESENT | File/folder exists, has content, upstream and tracked code are not newer. |
| MISSING | No file at any expected path. |
| STALE | Upstream artifact is newer (same date basis), or tracked code has a git commit newer than the artifact, or an upstream artifact is itself STALE ("derived from stale ..." - a sync report that says "in sync" about a stale contract is stale too). CONTEXT is stale when older than the newest of PRD/sad. In the sdd layout a migration `files_hint` points to the staged copy under `docs/features/<slug>/migrations/`, which never changes after `implement` promotes it; the script tracks the live migration dirs instead. |
| INCOMPLETE | Exists but not usable as a contract: near-empty (<5 lines), idea-brief not Confirmed, ADR not Accepted, tracker.md or tasks.json missing, no glossary entries. |
| EXTERNAL | Declared in `.audit-external`: lives in Confluence / Jira / Notion, content and dates not checked. Treat as a risk, not as PRESENT: agents and reviewers working from the repo do not see it. |
| N/A | Not produced by this layout (idea-brief in sdd). |
| note: partly external | A PRESENT artifact that points to a Confluence / Notion / Google Docs page ("see Confluence", "not copied here", a page URL) or is listed in `.audit-external`. Report it as "PRESENT, partly external": the repo copy is not the whole contract. |
| gates: INCONSISTENT | A later gate passed while an earlier one is open: review PASS but tracker not all done; code committed after the review PASS; PRD/spec still Draft while sad.md exists. |

Artifact date = frontmatter `updated_at`, else a `Run at:` / `generated_at` line, else the
last git commit, else mtime. Comparisons across different bases (e.g. `updated_at` vs
`git`) are reported as "maybe older" and do NOT raise STALE: copy/rebase/format commits
make git dates noisy. "updated_at not bumped" means the file was committed later than its
`updated_at` - either a cosmetic commit or someone edited content without bumping the date;
check the diff before trusting either date.

## Protocol

1. **Resolve.** Find `docs/features/<slug>/` (or the given path). If it does not exist, list
   `docs/features/*` and stop - do not guess a slug.
2. **Scan.** Run the bundled script (read-only):
   ```bash
   bash .claude/skills/ao-sdlc-audit/scripts/audit.sh docs/features/<slug> [--code data-model=migrations ...]
   ```
   It prints TSV: `artifact, status, path, date, basis, notes`. If the script cannot run
   (no bash), apply the same criteria by hand with `ls`, frontmatter and `git log -1`.
3. **Verify by reading.** The script sees dates and markers, not meaning. For every STALE
   or INCOMPLETE row open the file and confirm in one sentence (e.g. "data-model has no
   table for the `comments` aggregate that sad §5 adds"). Downgrade false positives to
   PRESENT and say why. Concrete checks the script cannot do:
   - CONTEXT: every role named in PRD §4 user stories and every new noun in sad §5
     building blocks has a Glossary entry (a term that appears only inside a `NOT ...`
     reference does not count as defined);
   - data-model: every aggregate / table named in sad §5 and §8 (e.g. outbox, audit
     tables) has a section or DDL;
   - tasks/: tracker statuses match reality - if code for a task exists in the repo or a
     review PASS exists, a `todo` / `review` row is a stale tracker, not open work; code
     commits after the tracker date that match no task are unplanned work (name them);
   - adr/ and sad: an Accepted ADR or a sad section (building blocks, risks) contradicted
     by later code (e.g. "only channel X" / "no fallback" while a channel-Y adapter exists)
     is stale by content even when its date is fine - read the decision against
     `git log` after the artifact date; an ADR must be superseded, sad re-designed;
   - _review/: a PASS whose findings leave a task DoD open (a "TODO" that the DoD
     requires) is not a gate; the script also flags code committed after the review date;
   - partly external rows: name what lives outside (e.g. "§7 deployment in Confluence HLD")
     - that part is invisible to every agent and reviewer working from the repo.
4. **Report** in this order:
   - one header line: slug, layout (sdlc | sdd), size, where code paths came from;
   - status table: `Artifact | Phase | Status | Date (basis) | Evidence`;
   - gate line (OK / INCONSISTENT + reason);
   - **3-5 recommendations**, most critical first. Priority: gate inconsistency > MISSING
     upstream artifact (everything below is built on sand) > STALE contract (data-model,
     openapi) > MISSING downstream > INCOMPLETE > CONTEXT drift. Each line names the skill
     to run next for the detected layout, or the concrete manual action:

     | Gap | sdlc | sdd |
     |-----|------|-----|
     | requirements | `/sdlc:write-prd` | `/sdd:specify` |
     | architecture | `/sdlc:architecture-design` | `/sdd:design` |
     | data model | `/sdlc:generate-data-model` | `/sdd:data-model` |
     | API contract + sync report | `/sdlc:api-forge` | `/sdd:api` |
     | tasks | `/sdlc:break-tasks` | `/sdd:tasks` |
     | decision | `/sdlc:decide-adr` | `/sdd:decide-adr` |
     | glossary term | `/sdlc:fix-term` | `/sdd:glossary` |

     For an EXTERNAL row the action is "pull it into the repo": copy the Confluence HLD into
     `sad.md` (or run the design skill with it as input) so downstream skills can read it.
5. **Stop.** Do not fix anything unless the user asks.

## Definition of Done

- All 9 rows plus the gate row are in the table; none is silently skipped.
- Every STALE / INCOMPLETE row has evidence from reading the file, not only from the script.
- 3-5 recommendations, each actionable and tied to a row.
- No files were created or modified.

## Anti-patterns

- Treating "file exists" as "contract holds" - an empty PRD or a Proposed ADR is not a gate.
- Raising STALE on git dates alone after a bulk copy/rename commit.
- Recommending all 9 fixes - pick the 3-5 that unblock the next stage.
- Auditing artifacts outside `docs/features/<slug>/` (Jira, Notion, Slack) - out of scope;
  mention them only if the user names them, and mark them "external, not checked".
