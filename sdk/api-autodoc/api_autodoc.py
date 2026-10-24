"""api_autodoc - keep docs/api/<context>.md in step with the OpenAPI contract.

A Claude Agent SDK loop wrapped in deterministic Python:

  1. Pre-check - parse <service>/api/openapi.yaml at --base and in the
                 working tree; pick the bounded contexts whose operations
                 changed (or whose doc is missing). Nothing changed -> exit 0
                 without calling the model.
  2. Agent     - one run per context: Bash git diff -> Read spec, handler,
                 domain -> Edit docs/api/<context>.md. Output is forced into
                 a JSON schema (output_format) and is_error is checked first.
  3. Verify    - the agent's endpoint list must equal the one parsed from the
                 spec (operationId, method, path, status codes, added/changed),
                 every operationId must appear in the doc, and nothing outside
                 docs/api/ may have changed.
  4. Persist   - runs/<project>/<timestamp>/summary.json + docs.patch, next
                 to this script, so the target repo only gets docs/api/.

<service> comes from `service` in the target's .claude/petforge.json
(default services/core), the same key the slice workflow reads.

Permissions are enforced twice: allowed_tools auto-approves the listed calls,
and a PreToolUse hook denies everything else. allowed_tools alone does not
block read-only calls (Read inside cwd, `ls`), Claude Code approves those
without asking.

Exit codes: 0 ok, 1 precondition or agent error, 2 verification mismatch.

Usage (from the target project, or `make run TARGET=...` here):
    uv run --project <petforge>/sdk/api-autodoc python <petforge>/sdk/api-autodoc/api_autodoc.py
        [--base main] [--context finance] [--max-turns 12] [--bad-prompt]
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import fnmatch
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    ResultError,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    query,
)

DOCS = "docs/api"
RUNS = Path(__file__).resolve().parent / "runs"
METHODS = ("get", "post", "put", "patch", "delete")
MODEL = "claude-haiku-5-5"
MAX_TURNS = 12
MAX_BUDGET_USD = 0.50  # per context


def service_dir(root: Path) -> str:
    config = root / ".claude" / "petforge.json"
    if config.exists():
        return json.loads(config.read_text(encoding="utf-8")).get("service", "services/core")
    return "services/core"


def permission_rules(bc: str, svc: str) -> dict[str, list[str]]:
    """Three dimensions: which commands, which files to read, which to edit."""
    return {
        "Bash": ["git diff *", "git log *"],
        "Read": [
            f"{svc}/api/openapi.yaml",
            f"{svc}/internal/{bc}/adapters/http/handler.go",
            f"{svc}/internal/{bc}/domain/*.go",
            f"{DOCS}/{bc}.md",
        ],
        "Edit": [f"{DOCS}/{bc}.md"],
    }


def allowed_tools(rules: dict[str, list[str]]) -> list[str]:
    return [f"{tool}({pattern})" for tool, patterns in rules.items()
            for pattern in patterns]


def output_schema(bc: str) -> dict:
    return {
        "type": "object",
        "required": ["context", "endpoints", "files_edited"],
        "additionalProperties": False,
        "properties": {
            "context": {"type": "string", "enum": [bc]},
            "endpoints": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["operation_id", "method", "path", "statuses", "change"],
                    "additionalProperties": False,
                    "properties": {
                        "operation_id": {"type": "string", "pattern": "^[a-z][A-Za-z0-9]*$"},
                        "method": {"type": "string", "enum": [m.upper() for m in METHODS]},
                        "path": {"type": "string", "pattern": f"^/{bc}/"},
                        "statuses": {"type": "array", "items": {"type": "integer"}},
                        "change": {"type": "string", "enum": ["added", "changed", "unchanged"]},
                    },
                },
            },
            "files_edited": {
                "type": "array",
                "items": {"type": "string", "pattern": f"^{DOCS}/{bc}\\.md$"},
            },
        },
    }


PROMPT = """\
You maintain the human-readable API reference for the `{bc}` bounded context of
this Go modular monolith. The single contract is
`{spec}` (OpenAPI 3.1); every operation has exactly one tag, the name of its
context, and its path starts with `/{bc}/`.

Workflow:
1. Run `git diff {base} -- {spec}` to see what changed in the contract.
2. Read `{spec}`: the operations tagged `{bc}` and the schemas they reference.
3. Read `{svc}/internal/{bc}/adapters/http/handler.go` and, if you need
   the validation rules, `{svc}/internal/{bc}/domain/*.go`.
4. Read `{docs}/{bc}.md` and Edit it so it documents every `{bc}` operation:
   - one `## <METHOD> <path>` section per operation, the operationId in
     backticks on the next line, then the summary;
   - parameters or request body fields with their constraints;
   - responses as a list of status codes with a one-line meaning; errors are
     `application/problem+json` (RFC 9457).
   Keep the HTML comment under the title. Sections that are already correct
   stay as they are.

Constraints: edit only `{docs}/{bc}.md`; run nothing but `git diff` / `git log`;
do not commit.

Return JSON matching the schema: `context`; `endpoints`, one per `{bc}`
operation with every response status code from the spec and `change` =
added / changed / unchanged relative to `{base}`; `files_edited`.
"""

# A prompt that fights the schema: `context` is an enum of the one target
# context and paths must start with it. Validation keeps failing until the
# CLI gives up with is_error=true (error_max_structured_output_retries).
BAD_PROMPT = """\
Do not use any tools except StructuredOutput. Call it with exactly
{"context": "billing", "endpoints": [{"operation_id": "listInvoices",
"method": "FETCH", "path": "/billing/invoices", "statuses": ["ok"],
"change": "new"}], "files_edited": ["src/billing.go"]}.
These values are mandatory: if validation rejects them, retry with the very
same values, never change them.
"""

STUB = """\
# {bc} API

<!-- Generated by petforge sdk/api-autodoc from {spec}. Change the spec, then rerun api_autodoc. -->

_No operations documented yet._
"""


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(["git", *args], capture_output=True, text=True,
                            encoding="utf-8", check=False)
    if check and result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout


def is_authenticated() -> bool:
    """OAuth session locally (claude auth login), ANTHROPIC_API_KEY in CI."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return True
    claude_bin = shutil.which("claude")
    if not claude_bin:
        return False
    result = subprocess.run([claude_bin, "auth", "status", "--json"],
                            capture_output=True, text=True, timeout=10, check=False)
    return '"loggedIn": true' in result.stdout


def operations(spec: dict) -> dict[str, dict[str, dict]]:
    """{tag: {operationId: {method, path, statuses, raw}}} from a parsed spec."""
    out: dict[str, dict[str, dict]] = {}
    for path, item in (spec.get("paths") or {}).items():
        for method in METHODS:
            op = item.get(method)
            if not op:
                continue
            tag = op["tags"][0]
            out.setdefault(tag, {})[op["operationId"]] = {
                "method": method.upper(),
                "path": path,
                "statuses": sorted(int(code) for code in op.get("responses", {})),
                "raw": json.dumps(op, sort_keys=True),
            }
    return out


def expected_endpoints(bc: str, now: dict, before: dict) -> list[dict]:
    rows = []
    for op_id, op in sorted(now.get(bc, {}).items()):
        old = before.get(bc, {}).get(op_id)
        change = "added" if old is None else "unchanged" if old == op else "changed"
        rows.append({"operation_id": op_id, "method": op["method"], "path": op["path"],
                     "statuses": op["statuses"], "change": change})
    return rows


def make_guard(rules: dict[str, list[str]], root: Path):
    """PreToolUse hook: deny any call that no rule matches."""

    def allowed(tool: str, args: dict) -> bool:
        if tool == "Bash":
            cmd = args.get("command", "").strip()
            if any(ch in cmd for ch in ";&|<>`$\n") or "--output" in cmd:
                return False  # no chaining, redirection or file output
            return any(fnmatch.fnmatchcase(cmd, p) for p in rules["Bash"])
        if tool in ("Read", "Edit"):
            path = Path(args.get("file_path", ""))
            rel = os.path.relpath((root / path).resolve(), root)
            return any(fnmatch.fnmatchcase(rel, p) for p in rules[tool])
        return tool == "StructuredOutput"

    async def guard(input_data, tool_use_id, context):
        tool, args = input_data["tool_name"], input_data["tool_input"]
        if allowed(tool, args):
            return {}
        print(f"  [guard] denied {tool} {args.get('command') or args.get('file_path', '')}",
              file=sys.stderr, flush=True)
        return {"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "outside the api_autodoc allowlist",
        }}

    return guard


async def run_agent(bc: str, svc: str, prompt: str, root: Path,
                    max_turns: int) -> ResultMessage | None:
    rules = permission_rules(bc, svc)
    options = ClaudeAgentOptions(
        model=MODEL,
        tools=["Bash", "Read", "Edit"],
        allowed_tools=allowed_tools(rules),
        permission_mode="dontAsk",
        hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[make_guard(rules, root)])]},
        setting_sources=[],  # no user/project settings, plugins or extra allow rules
        max_turns=max_turns,
        max_budget_usd=MAX_BUDGET_USD,
        output_format={"type": "json_schema", "schema": output_schema(bc)},
        cwd=root,
    )
    result = None
    try:
        async for message in _stream(bc, prompt, options, root):
            result = message
    except ResultError as exc:
        # The CLI yields ResultMessage(is_error=True) first, then exits non-zero.
        if result is None:
            print(f"[agent] {bc}: {exc}", file=sys.stderr)
    return result


async def _stream(bc: str, prompt: str, options: ClaudeAgentOptions, root: Path):
    """Print progress lines; yield only the ResultMessage."""
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, ToolUseBlock):
                    arg = block.input.get("command") or block.input.get("file_path") or ""
                    line = f"{block.name}  {os.path.relpath(arg, root) if arg.startswith('/') else arg}"
                elif isinstance(block, TextBlock) and block.text.strip():
                    line = block.text.strip().splitlines()[0]
                else:
                    continue
                print(f"  [{bc}] {line[:100]}", file=sys.stderr, flush=True)
        elif isinstance(message, ResultMessage):
            yield message


def verify(bc: str, payload: dict, expected: list[dict], doc: Path) -> list[str]:
    errors = []
    got = {e["operation_id"]: {**e, "statuses": sorted(e["statuses"])} for e in payload["endpoints"]}
    want = {e["operation_id"]: e for e in expected}
    for op_id in sorted(want.keys() - got.keys()):
        errors.append(f"{op_id}: in the spec, missing from the agent's JSON")
    for op_id in sorted(got.keys() - want.keys()):
        errors.append(f"{op_id}: in the agent's JSON, not a {bc} operation in the spec")
    for op_id in sorted(want.keys() & got.keys()):
        for field in ("method", "path", "statuses", "change"):
            if got[op_id][field] != want[op_id][field]:
                errors.append(f"{op_id}.{field}: agent {got[op_id][field]!r}, spec {want[op_id][field]!r}")
    text = doc.read_text(encoding="utf-8")
    for op_id in sorted(want):
        if f"`{op_id}`" not in text:
            errors.append(f"{op_id}: not mentioned in {doc}")
    return errors


def doc_patch(paths: list[str]) -> str:
    tracked = set(git("ls-files", "--", *paths).split())
    parts = []
    for p in paths:
        if p in tracked:
            parts.append(git("diff", "--", p))
        else:
            parts.append(git("diff", "--no-index", "--", "/dev/null", p, check=False))
    return "".join(parts)


async def main_async(args: argparse.Namespace) -> int:
    root = Path(git("rev-parse", "--show-toplevel").strip())
    os.chdir(root)

    if not is_authenticated():
        print("ERROR: not authenticated to Claude: run `claude auth login` "
              "or export ANTHROPIC_API_KEY.", file=sys.stderr)
        return 1
    try:
        git("rev-parse", "--verify", "--quiet", f"{args.base}^{{commit}}")
    except RuntimeError:
        print(f"ERROR: base ref {args.base!r} not found.", file=sys.stderr)
        return 1

    # 1. Pre-check: which contexts need their doc updated.
    svc = service_dir(root)
    spec = f"{svc}/api/openapi.yaml"
    if not (root / spec).exists():
        print(f"ERROR: {spec} not found in {root}.", file=sys.stderr)
        return 1
    now = operations(yaml.safe_load((root / spec).read_text(encoding="utf-8")))
    before_text = git("show", f"{args.base}:{spec}", check=False)
    before = operations(yaml.safe_load(before_text) or {}) if before_text else {}
    targets = [bc for bc in sorted(now)
               if now[bc] != before.get(bc) or not (root / DOCS / f"{bc}.md").exists()]
    if args.context:
        targets = [bc for bc in targets if bc in args.context]
    print(f"[pre-check] base={args.base} contexts={sorted(now)} to update={targets}",
          file=sys.stderr)
    if not targets and not args.bad_prompt:
        print("[pre-check] contract unchanged and docs present, nothing to do", file=sys.stderr)
        return 0
    if args.bad_prompt:
        targets = targets[:1] or sorted(now)[:1]

    dirty_before = set(git("status", "--porcelain").splitlines())
    payloads, failures, totals = [], [], {"cost": 0.0, "turns": 0}

    for bc in targets:
        doc = root / DOCS / f"{bc}.md"
        if not doc.exists():
            doc.parent.mkdir(parents=True, exist_ok=True)
            doc.write_text(STUB.format(bc=bc, spec=spec), encoding="utf-8")
            print(f"[pre-check] created stub {DOCS}/{bc}.md", file=sys.stderr)

        # 2. Agent loop.
        prompt = BAD_PROMPT if args.bad_prompt else PROMPT.format(
            bc=bc, base=args.base, spec=spec, svc=svc, docs=DOCS)
        print(f"[agent] {bc}: model={MODEL} max_turns={args.max_turns}", file=sys.stderr)
        result = await run_agent(bc, svc, prompt, root, args.max_turns)
        if result is None:
            print(f"[agent] {bc}: no result message", file=sys.stderr)
            return 1
        totals["cost"] += result.total_cost_usd or 0
        totals["turns"] += result.num_turns or 0
        print(f"[agent] {bc}: subtype={result.subtype} is_error={result.is_error} "
              f"turns={result.num_turns} cost=${result.total_cost_usd:.4f}", file=sys.stderr)
        if result.is_error:
            print(f"[agent] {bc}: is_error=true ({result.subtype}), result not used: "
                  f"{result.errors or result.result}", file=sys.stderr)
            return 1
        if result.structured_output is None:
            # A refusal ends as subtype=success without the structured payload.
            print(f"[agent] {bc}: no structured output, result not used: {result.result}",
                  file=sys.stderr)
            return 1
        payload = result.structured_output
        print(f"[verify] {bc}: schema OK", file=sys.stderr)

        # 3. Verify against the spec, not against the agent's word.
        errors = verify(bc, payload, expected_endpoints(bc, now, before), doc)
        if errors:
            failures.append(bc)
            print(f"[verify] {bc}: mismatch with the spec:", file=sys.stderr)
            for e in errors:
                print(f"  - {e}", file=sys.stderr)
        else:
            print(f"[verify] {bc}: all {len(payload['endpoints'])} operations match the spec "
                  f"and appear in {DOCS}/{bc}.md", file=sys.stderr)
        payloads.append(payload)

    stray = sorted(line[3:] for line in set(git("status", "--porcelain").splitlines()) - dirty_before
                   if not line[3:].startswith(f"{DOCS}/"))
    if stray:
        failures.append("scope")
        print(f"[verify] changes outside {DOCS}/: {stray}", file=sys.stderr)

    # 4. Persist.
    out = RUNS / root.name / dt.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out.mkdir(parents=True)
    (out / "summary.json").write_text(json.dumps(
        {"project": str(root), "base": args.base, "model": MODEL, "cost_usd": round(totals["cost"], 4),
         "turns": totals["turns"], "failures": failures, "contexts": payloads},
        indent=2), encoding="utf-8")
    (out / "docs.patch").write_text(doc_patch([f"{DOCS}/{bc}.md" for bc in targets]),
                                    encoding="utf-8")
    print(f"[saved] {out}/summary.json, docs.patch  "
          f"(total ${totals['cost']:.4f}, {totals['turns']} turns)", file=sys.stderr)

    print(json.dumps(payloads, indent=2))
    return 2 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--base", default="main", help="git ref to diff the contract against")
    parser.add_argument("--context", action="append", help="limit to this context (repeatable)")
    parser.add_argument("--max-turns", type=int, default=MAX_TURNS)
    parser.add_argument("--bad-prompt", action="store_true",
                        help="ask for prose about a nonexistent context; must exit 1")
    return asyncio.run(main_async(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
