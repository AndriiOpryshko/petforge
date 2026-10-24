# api-autodoc

Keeps `docs/api/<context>.md` in step with the OpenAPI contract of a Go modular monolith
(`services/<svc>/internal/<context>`, one tag per operation). A Claude Agent SDK loop in Python:

1. **Pre-check.** Parses `<svc>/api/openapi.yaml` at `--base` and in the working tree and picks the
   contexts whose operations changed or whose doc is missing. If nothing changed, it exits 0 without
   calling the model.
2. **Agent.** Runs once per context: `git diff` → Read spec, handler, domain → Edit
   `docs/api/<context>.md`. The output is forced into a JSON schema (`output_format`), and `is_error`
   is checked before the result is used.
3. **Verify.** The agent's endpoint list must equal the one parsed from the spec (operationId, method,
   path, status codes, added/changed/unchanged). Every operationId must appear in the doc, and nothing
   outside `docs/api/` may change.
4. **Persist.** Writes `runs/<project>/<timestamp>/summary.json` and `docs.patch` here, so the target
   repo only gets `docs/api/`.

`<svc>` is the `service` key of the target's `.claude/petforge.json` (default `services/core`).

## Run

```sh
make install
make run TARGET=../../../spilno BASE=main   # stdout: JSON per context, stderr: progress + verify
make bad-prompt TARGET=../../../spilno      # must print is_error=True and exit 1
make test                                   # offline: guard, spec parsing, schema
```

Auth: an OAuth session (`claude auth login`) locally, or `ANTHROPIC_API_KEY` from the environment
(GitHub Secrets in CI). The key is never read from a file.

Exit codes: `0` ok, `1` precondition or agent error (`is_error`, no structured output), `2` the agent's
JSON or doc disagrees with the spec.

## Permissions

The run has three dimensions, each built per context:

| Tool | Allowed |
| --- | --- |
| Bash | `git diff *`, `git log *`, with no `; & \| < > $` backticks or `--output` |
| Read | `<svc>/api/openapi.yaml`, `<svc>/internal/<bc>/adapters/http/handler.go`, `<svc>/internal/<bc>/domain/*.go`, `docs/api/<bc>.md` |
| Edit | `docs/api/<bc>.md` |

Only `Bash`, `Read` and `Edit` are available (`tools=`). No user or project settings are loaded
(`setting_sources=[]`). Limits are `max_turns=12` and `max_budget_usd=0.50` per context.

`allowed_tools` only auto-approves calls. It does not block the rest: Claude Code runs read-only calls
(Read inside cwd, `ls`, `cat`) without asking, even with `permission_mode="dontAsk"`. A `PreToolUse`
hook therefore matches every call against the same rules and denies anything else, which shows up as
`[guard] denied ...` on stderr.
