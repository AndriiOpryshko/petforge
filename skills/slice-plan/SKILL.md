---
name: slice-plan
description: Turn a plain description of a new entity into a petforge slice spec (JSON) and check it against the project before any code is written. First step of the vertical-slice workflow for Go modular monoliths laid out as services/<svc>/internal/<context>/{domain,app,ports,adapters}. Use when asked to "plan a slice", "add an entity", "new CRUD for X", "/petforge:slice-plan <description>".
argument-hint: <Entity> in context <context>: <fields and rules in plain words>
---

# slice-plan

Writes `.petforge/slices/<entity-kebab>.json` and validates it with the generator. Writes no code.

## Steps

1. Read `.claude/petforge.json` if it exists (keys: `service`, `gen`, `lint`, `test`). Defaults:
   the only `services/*` with `api/openapi.yaml`, `mise run gen`, `mise run lint`, `mise run test`.
2. Build the spec from the arguments. Do not ask questions when the description is usable: pick the
   reasonable reading and list your assumptions in the report.
3. Write the spec, then run in one Bash call:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/slice.ts" check <spec>`
4. If `check` fails because the project does not follow the layout, dispatch the `pattern-scout`
   agent once, adjust, and run `check` again. Otherwise do not explore the codebase: the generator
   already encodes the layout.
5. Report: a field table (name, type, required, rules), assumptions, and the file list from `check`.

## Spec format

```json
{
  "context": "governance",
  "contextDescription": "Board meetings and decisions.",
  "entity": "Meeting",
  "plural": "meetings",
  "summary": "Schedule a board meeting",
  "fields": [
    { "name": "title", "type": "text", "min": 1, "max": 200 },
    { "name": "held_at", "type": "timestamptz" },
    { "name": "location", "type": "text", "max": 200, "nullable": true },
    { "name": "quorum_required", "type": "bool", "default": true }
  ],
  "rules": []
}
```

- `context`: lower-case word; must be a new context (adding to an existing one is not supported yet).
- `entity`: PascalCase singular. `plural` (table and path) defaults to snake_case entity + `s`.
- Field `type`: `text` (min/max characters), `int64` (min/max), `bool`, `enum` (`values`),
  `date`, `timestamptz`. `nullable: true` makes a field optional and nullable; `default` makes it
  optional with that value. A field is never both. Enums cannot be nullable.
- Do not list `id`, `created_at`, `updated_at`: they are always added.
- Money is `int64` in minor units (`amount_cents`), never a float.
- `rules`: cross-field invariants in plain English (for example `"ends_at is on or after signed_at"`).
  The generator ignores them; `slice-tests` implements each one test-first.

The generated slice provides: create (201/422), get by id (200/404), cursor-paginated list, RFC 9457
problem+json errors, integration tests on a real database, domain unit tests and Bruno requests.
