#!/usr/bin/env bash
# PreToolUse guard for Edit/Write/MultiEdit in a petforge project.
# Blocks (exit 2, reason on stderr):
#   1. edits to generated code (*.gen.go, sqlcgen/, src/api/gen/, routeTree.gen.ts);
#   2. Go imports of another bounded context's sub-packages (internal/<bc>/<pkg>);
#   3. non-stdlib imports in a context's domain package (uuid allowed).
# Every block is appended to the project's log (.claude/petforge.json "log", default LOG.md)
# when that file exists and the branch is feature-<n>/*.
set -euo pipefail

command -v jq > /dev/null || exit 0
input="$(cat)"
file="$(jq -r '.tool_input.file_path // empty' <<< "$input")"
[ -n "$file" ] || exit 0
cwd="$(jq -r '.cwd // empty' <<< "$input")"
text="$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | .[].new_string)] | map(select(. != null)) | join("\n")' <<< "$input")"

block() {
  local reason="$1"
  echo "petforge guard: $reason" >&2
  local root log branch label
  root="$(git -C "${cwd:-.}" rev-parse --show-toplevel 2> /dev/null || true)"
  if [ -n "$root" ]; then
    log="LOG.md"
    [ -f "$root/.claude/petforge.json" ] && log="$(jq -r '.log // "LOG.md"' "$root/.claude/petforge.json")"
    branch="$(git -C "$root" branch --show-current 2> /dev/null || true)"
    if [ -f "$root/$log" ] && [[ "$branch" =~ ^feature-([0-9]+)/ ]]; then
      label="F${BASH_REMATCH[1]}"
      echo "- $(date +%Y-%m-%dT%H:%M:%S%z) | $label | hook | blocked ${file#"$root"/}: $reason" >> "$root/$log"
    fi
  fi
  exit 2
}

case "$file" in
  *.gen.go | */sqlcgen/* | */src/api/gen/* | *routeTree.gen.ts)
    block "generated file; change the source (openapi.yaml, queries/*.sql, migrations) and run the codegen instead"
    ;;
esac

case "$file" in *.go) ;; *) exit 0 ;; esac

# Context of the edited file, if it lives inside one.
own=""
if [[ "$file" =~ /internal/([a-z0-9]+)/ ]]; then own="${BASH_REMATCH[1]}"; fi

imports="$(grep -Eo '"[^"[:space:]]+"' <<< "$text" | tr -d '"' || true)"
while IFS= read -r imp; do
  [ -n "$imp" ] || continue
  if [[ "$imp" =~ /internal/([a-z0-9]+)/[a-z0-9] ]]; then
    other="${BASH_REMATCH[1]}"
    if [ "$other" != "platform" ] && [ "$other" != "$own" ]; then
      block "imports $imp: other contexts are reachable only through their module package (internal/$other)"
    fi
  fi
  if [[ "$file" == */internal/*/domain/* && "$file" != *_test.go ]]; then
    first="${imp%%/*}"
    if [[ "$first" == *.* && "$imp" != github.com/google/uuid ]]; then
      block "imports $imp into a domain package; domain may use only the standard library and github.com/google/uuid"
    fi
  fi
done <<< "$imports"

exit 0
