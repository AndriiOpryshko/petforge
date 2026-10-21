#!/usr/bin/env bash
# Single validation entrypoint, used locally and in CI.
# Exits non-zero on the first failing check.

set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PLUGIN=.claude-plugin/plugin.json
MARKETPLACE=.claude-plugin/marketplace.json

step() { printf '\n== %s\n' "$*"; }

step "JSON syntax"
while IFS= read -r f; do
  jq empty "$f" || { echo "invalid JSON: $f"; exit 1; }
  echo "ok $f"
done < <(find . -name '*.json' -not -path './.git/*' -not -path '*/node_modules/*')

step "Plugin and marketplace (claude plugin validate --strict)"
claude plugin validate --strict .

step "Manifest sync"
pname="$(jq -r '.name' "$PLUGIN")"
pversion="$(jq -r '.version' "$PLUGIN")"
mname="$(jq -r '.plugins[0].name' "$MARKETPLACE")"
mversion="$(jq -r '.plugins[0].version' "$MARKETPLACE")"
[ "$pname" = "$mname" ] || { echo "name mismatch: plugin.json '$pname' vs marketplace '$mname'"; exit 1; }
[ "$pversion" = "$mversion" ] || { echo "version mismatch: plugin.json '$pversion' vs marketplace '$mversion'"; exit 1; }
echo "ok $pname $pversion"

step "Shell scripts"
scripts=()
while IFS= read -r s; do scripts+=("$s"); done < <(find . -name '*.sh' -not -path './.git/*')
for s in "${scripts[@]}"; do
  bash -n "$s"
  [ -x "$s" ] || { echo "not executable: $s"; exit 1; }
done
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "${scripts[@]}"
  echo "shellcheck ok (${#scripts[@]} files)"
elif [ -n "${CI:-}" ]; then
  echo "shellcheck is required in CI"; exit 1
else
  echo "shellcheck not installed, skipped (CI runs it)"
fi

step "Tests"
shopt -s nullglob
ran=0
for t in tests/*.test.sh; do
  bash "$t"
  ran=$((ran + 1))
done
[ "$ran" -gt 0 ] || echo "no tests yet"
