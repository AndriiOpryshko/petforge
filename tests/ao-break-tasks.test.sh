#!/usr/bin/env bash
# Runs the ao-break-tasks checker on a tiny feature (fixture PRD + CONTEXT + task files, plan =
# the skill's templates/tasks.example.json): the example must pass, each broken copy must fail
# with the expected ERROR.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
check="$root/.claude/skills/ao-break-tasks/scripts/check-tasks.mjs"
example="$root/.claude/skills/ao-break-tasks/templates/tasks.example.json"
fixture="$root/tests/fixtures/ao-break-tasks/demo"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if ! command -v node >/dev/null 2>&1; then
  echo "ao-break-tasks: node not installed, skipped"; exit 0
fi

fail=0
setup() {
  rm -rf "$tmp/demo"
  cp -R "$fixture" "$tmp/demo"
  cp "$example" "$tmp/demo/tasks/tasks.json"
}
mutate() { # jq filter applied to tasks.json
  jq "$1" "$tmp/demo/tasks/tasks.json" > "$tmp/t.json" && mv "$tmp/t.json" "$tmp/demo/tasks/tasks.json"
}
run() { node "$check" "$tmp/demo" --prd PRD.ao-prd.md 2>&1; }

setup
if out="$(run)"; then
  for want in 'Stage-1 ACs covered 3/3' 'error codes used 3/3' 'parallel_width=2' 'phases: 1:[M1 D1]'; do
    printf '%s\n' "$out" | grep -qF "$want" || { echo "FAIL ok-case: missing '$want'"; printf '%s\n' "$out"; fail=1; }
  done
  printf '%s\n' "$out" | grep -q '^ERROR' && { echo "FAIL ok-case has errors"; fail=1; }
else
  echo "FAIL example plan rejected:"; printf '%s\n' "$out"; fail=1
fi

expect_error() { # name, jq filter, expected ERROR fragment
  setup
  [ -n "$2" ] && mutate "$2"
  local out
  if out="$(run)"; then
    echo "FAIL $1: checker passed"; fail=1
  elif ! printf '%s\n' "$out" | grep -F 'ERROR' | grep -qF "$3"; then
    echo "FAIL $1: no ERROR containing '$3'"; printf '%s\n' "$out" | grep -E '^(ERROR|WARN)'; fail=1
  fi
}

expect_error cycle         '(.tasks[] | select(.id=="M1") | .deps) = ["E1"]' 'dependency cycle'
expect_error missing-dep   '(.tasks[] | select(.id=="Q1") | .deps) = ["M9"]' 'dep M9 does not exist'
expect_error unknown-ac    '(.tasks[] | select(.id=="D1") | .acs) = ["AC-02", "AC-99"]' 'AC AC-99 is not in'
expect_error uncovered-ac  '(.tasks[] | select(.id=="D1") | .acs) = [] | (.tasks[] | select(.id=="A1") | .acs) = ["AC-01"]' 'Stage-1 AC-02 is covered by no task'
expect_error unused-code   '(.tasks[] | select(.id=="H1") | .errors) = ["governance.protocol_not_found"]' 'identity.session_required is used by no task'
expect_error org-filter    '(.tasks[] | select(.id=="Q1") | .dod) = "go test ./internal/governance/adapters/postgres/... green."' 'no association_id filter line'
expect_error layer-order   '(.tasks[] | select(.id=="H1") | .deps) = ["Q1"]' 'H1 (http) does not depend on any app task of governance'
expect_error later-layer   '(.tasks[] | select(.id=="D1") | .deps) = ["H1"]' 'D1 (domain) depends on H1 (http), a later layer'
expect_error generated     '(.tasks[] | select(.id=="Q1") | .files_hint) += ["services/core/internal/governance/adapters/postgres/sqlcgen/protocols.sql.go"]' 'is generated code'
expect_error vague-dod     '(.tasks[] | select(.id=="U1") | .dod) = "Tests pass."' 'U1: dod names no command'
expect_error estimate      '(.tasks[] | select(.id=="A1") | .est) = "3d"' 'est "3d"'
expect_error wrong-mapping '(.tasks[] | select(.id=="H1") | .layer) = "app"' 'ao_layer http must map to layer ports'
expect_error course-layer  '(.tasks[] | select(.id=="U1") | .layer) = "frontend"' 'not in the implement-tasks enum'

# Markdown twin with different deps.
setup
sed -i.bak 's/^deps: \[D1, Q1\]/deps: [D1]/' "$tmp/demo/tasks/A1.md"
if out="$(run)"; then echo "FAIL md-deps: checker passed"; fail=1
elif ! printf '%s\n' "$out" | grep -qF 'A1.md: deps [D1] differ'; then echo "FAIL md-deps"; printf '%s\n' "$out" | grep '^ERROR'; fail=1; fi

[ "$fail" -eq 0 ] && echo "ao-break-tasks checker: ok"
exit "$fail"
