---
name: slice-scaffold
description: Generate the whole vertical slice for a planned petforge spec - migration, OpenAPI paths and schemas, sqlc queries, domain, app, ports, postgres adapter, HTTP handler, context module and wiring, tests and Bruno requests - then run codegen and build. Second step of the petforge workflow. Use after slice-plan, or when asked to "scaffold the slice", "generate the entity", "/petforge:slice-scaffold [spec]".
argument-hint: "[path to spec; defaults to the newest .petforge/slices/*.json]"
---

# slice-scaffold

The generator writes every file deterministically. Your job is to run it and get the build green.

## Steps

1. Spec: the argument, or the newest file in `.petforge/slices/`. Commands come from
   `.claude/petforge.json` (`service`, `gen`) or default to `services/core` and `mise run gen`.
2. Run everything in ONE Bash call, from the repo root:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/scripts/slice.ts" scaffold <spec> \
     && <gen> \
     && (cd <service> && go mod tidy && go build ./... && go vet ./internal/<context>/...)
   ```

3. If it fails, read only the files named in the error and fix hand-written code. Never edit
   generated files (`*.gen.go`, `sqlcgen/`, `src/api/gen/`): change the spec, the SQL or
   `openapi.yaml` and rerun `<gen>`. The petforge hook blocks such edits.
4. Report the created and edited files (from the generator output) and the build result.
   Do not run the full test suite here; that is `slice-tests`.
