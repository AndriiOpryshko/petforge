# Codegen check — prove the delta generates before anyone merges it

The feature contract lives in `docs/features/<slug>/contracts/openapi.yaml`, while the repo's
codegen reads only `services/core/api/openapi.yaml`. Merging an unproven delta into the real
contract breaks `mise run gen` for everyone, so this step generates the delta in a **scratch
package** first. It writes nothing tracked; the scratch folders are deleted at the end.

## 0. Pitfall that decides the method

Never run a context's own config on the delta:

```bash
# WRONG — the config's `output:` wins over -o and overwrites internal/<bc>/adapters/http/gen/<bc>.gen.go
go tool -modfile=tools/go.mod oapi-codegen -config internal/governance/adapters/http/gen/oapi-codegen.yaml -o /tmp/x.go <delta>
```

Use a scratch config with its own `output:`.

## 1. Go server: oapi-codegen into a scratch package

The scratch package lives under `services/core/_scratch/` so it compiles inside the module with the
module's own dependencies; Go skips `_`-prefixed folders in `./...`, so `mise run lint` and
`mise run test` never see it. Read the tool version first:

```bash
grep 'oapi-codegen/v2 ' services/core/tools/go.mod      # e.g. v2.8.0 — say it in the report
```

Write `services/core/_scratch/<slug_pkg>/oapi-codegen.yaml` (`<slug_pkg>` = slug without dashes,
e.g. `boardprotocol`), mirroring the repo configs; one file per context tag the delta uses:

```yaml
package: <slug_pkg>
output: _scratch/<slug_pkg>/<bc>.gen.go
generate:
  models: true
  chi-server: true
  strict-server: true
  embedded-spec: true
output-options:
  include-tags: [<bc>]
compatibility:
  always-prefix-enum-values: true
```

Run from `services/core`:

```bash
go tool -modfile=tools/go.mod oapi-codegen \
  -config _scratch/<slug_pkg>/oapi-codegen.yaml \
  ../../docs/features/<slug>/contracts/openapi.yaml
go build ./_scratch/<slug_pkg> && go vet ./_scratch/<slug_pkg>
```

Two contexts in one delta -> one scratch package per context (`_scratch/<slug_pkg>_<bc>/`), since
both would define `Problem` and `ServerInterface` in one package.

Pass = code generated and built. Record in the report: tool version, the
`StrictServerInterface` methods generated (one per `operationId`), and the build result.

Known failures and their contract fix:

| Output | Cause | Fix the contract |
|---|---|---|
| `failed to load OpenAPI specification: map key "X" not found` | dangling `$ref` | add the component or fix the name |
| `unhandled Schema type: &[integer string]` | multi-type union | split into two fields or a `oneOf` of named schemas |
| duplicate type / method names | two operations or schemas with one name | rename by the naming rules |
| build error in `*.gen.go` | enum value collision, odd parameter style | named enum schema; simple `form` query params |

## 2. Web client: orval into a scratch folder

orval reads one input; give it the delta through a scratch config written as plain `.mjs` (no
`import 'orval'`, so it resolves from any folder). Same options as `apps/web/orval.config.ts`:

```js
// <scratchpad>/orval.<slug>.mjs
export default {
  feature: {
    input: { target: '<abs path>/docs/features/<slug>/contracts/openapi.yaml' },
    output: {
      mode: 'tags-split',
      target: '<scratchpad>/orval-<slug>/endpoints',
      schemas: '<scratchpad>/orval-<slug>/model',
      client: 'react-query',
      httpClient: 'fetch',
      baseUrl: '/api',
      clean: true,
      override: { fetch: { forceSuccessResponse: true } },
    },
  },
};
```

```bash
pnpm --filter @spilno/web exec orval --config <scratchpad>/orval.<slug>.mjs
```

Pass = one hook per operation (`use<OperationId>`), Problem types in `model/`. If `node_modules` is
missing (`mise run setup` not run), report "orval skipped: dependencies not installed" — a
supporting deferral, not a failure.

## 3. Merge dry run (optional, on a throwaway branch)

What the implementation will hit: merge the delta's paths, tags and components into
`services/core/api/openapi.yaml`, then

```bash
mise run gen
cd services/core && go build ./...
```

Expected and correct: `*Handler does not implement gen.StrictServerInterface (missing method
<OperationId>)` — the build breaks until every new operation has a handler (repo ADR 0003: "works
as a checklist"). Add the handler method (a stub that returns the operation's 404 / 501 problem is
enough for the dry run), build again, then `git restore` / drop the branch. This step never lands on
the feature branch from this skill; `implement-tasks` owns the real merge.

## 4. Clean up

```bash
rm -rf services/core/_scratch <scratchpad>/orval-<slug>
git status --short   # must show only the contract folder (and the rules file on a first run)
```
